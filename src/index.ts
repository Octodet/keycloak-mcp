#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import KcAdminClient from "@keycloak/keycloak-admin-client";
import { z } from "zod";
import pkg from '../package.json' with { type: 'json' };

// Import version from package.json
export const VERSION = pkg.version;

// Types
interface KeycloakConfig {
  baseUrl: string;
  adminUsername: string;
  adminPassword: string;
}

// Configuration schema with validation
const ConfigSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .min(1, "Keycloak URL cannot be empty")
    .refine(
      (url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return url.startsWith('http://') || url.startsWith('https://');
        }
      },
      "Keycloak URL must be a valid URL starting with http:// or https://"
    )
    .transform((url) => url.replace(/\/+$/, "")) // Remove trailing slashes
    .describe("Keycloak server URL"),
  
  adminUsername: z
    .string()
    .trim()
    .min(1, "Admin username cannot be empty")
    .describe("Keycloak admin username"),
  
  adminPassword: z
    .string()
    .trim()
    .min(1, "Admin password cannot be empty")
    .describe("Keycloak admin password"),
});

// Keycloak Service class
class KeycloakService {
  private config: KeycloakConfig;
  private client: KcAdminClient;
  private isAuthenticated: boolean = false;
  private authTokenExpiry: number = 0;

  constructor(config: KeycloakConfig) {
    this.config = ConfigSchema.parse(config);
    this.client = new KcAdminClient({
      baseUrl: this.config.baseUrl,
      realmName: "master",
    });
  }

  private async authenticate(): Promise<void> {
    // Check if we have a valid token
    const now = Date.now();
    if (this.isAuthenticated && now < this.authTokenExpiry) {
      return;
    }

    try {
      // Set the realm for authentication (usually master for admin operations)
      this.client.setConfig({ realmName: "master" });
      
      const authResult = await this.client.auth({
        username: this.config.adminUsername,
        password: this.config.adminPassword,
        grantType: "password",
        clientId: "admin-cli",
      });
      
      this.isAuthenticated = true;
      // Set token expiry to 5 minutes from now (tokens typically last longer, but this is safe)
      this.authTokenExpiry = now + (5 * 60 * 1000);
      
    } catch (error) {
      this.isAuthenticated = false;
      this.authTokenExpiry = 0;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to authenticate with Keycloak: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createUser(params: {
    realm: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    enabled?: boolean;
    emailVerified?: boolean;
    credentials?: Array<{
      type: string;
      value: string;
      temporary?: boolean;
    }>;
  }) {
    await this.authenticate();
    this.client.setConfig({ realmName: params.realm });

    const user = await this.client.users.create({
      realm: params.realm,
      username: params.username,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      enabled: params.enabled !== undefined ? params.enabled : true,
      emailVerified: params.emailVerified,
      credentials: params.credentials,
    });

    return user;
  }

  async deleteUser(realm: string, userId: string) {
    await this.authenticate();
    this.client.setConfig({ realmName: realm });

    await this.client.users.del({
      id: userId,
      realm,
    });
  }

  async listRealms() {
    await this.authenticate();
    return await this.client.realms.find();
  }

  async listUsers(realm: string) {
    await this.authenticate();
    this.client.setConfig({ realmName: realm });
    return await this.client.users.find();
  }

  async listRoles(realm: string, clientId: string) {
    await this.authenticate();
    this.client.setConfig({ realmName: realm });

    // Find the client by clientId (can be id or clientId string)
    let client = null;
    try {
      client = await this.client.clients.findOne({ realm, id: clientId });
    } catch {}
    
    if (!client) {
      const clients = await this.client.clients.find({ realm });
      client = clients.find(
        (c) => c.clientId === clientId || c.id === clientId
      );
    }
    
    if (!client) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Client '${clientId}' not found in realm '${realm}'.`
      );
    }
    
    if (!client.id || typeof client.id !== "string") {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Client found but has no valid id property.`
      );
    }

    const roles = await this.client.clients.listRoles({
      realm,
      id: client.id,
    });

    return { client, roles };
  }

  async updateUserRoles(params: {
    realm: string;
    userId: string;
    clientId: string;
    rolesToAdd?: string[];
    rolesToRemove?: string[];
  }) {
    await this.authenticate();
    this.client.setConfig({ realmName: params.realm });

    let added: string[] = [];
    let removed: string[] = [];
    let errors: string[] = [];

    // Find the client
    let client = null;
    try {
      client = await this.client.clients.findOne({ realm: params.realm, id: params.clientId });
    } catch {}
    
    if (!client) {
      const clients = await this.client.clients.find({ realm: params.realm });
      client = clients.find(
        (c) => c.clientId === params.clientId || c.id === params.clientId
      );
    }
    
    if (!client || !client.id || typeof client.id !== "string") {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Client '${params.clientId}' not found or invalid in realm '${params.realm}'.`
      );
    }

    // Fetch all roles for this client
    const allRoles = await this.client.clients.listRoles({
      realm: params.realm,
      id: client.id,
    });
    const nameToRole = Object.fromEntries(allRoles.map((r) => [r.name, r]));

    // Add roles
    if (params.rolesToAdd && params.rolesToAdd.length > 0) {
      const addObjs = params.rolesToAdd
        .map((name) => nameToRole[name])
        .filter(Boolean);
      
      if (addObjs.length !== params.rolesToAdd.length) {
        errors.push("Some roles to add not found");
      }
      
      if (addObjs.length > 0) {
        await this.client.users.addClientRoleMappings({
          id: params.userId,
          realm: params.realm,
          clientUniqueId: client.id,
          roles: addObjs,
        });
        added = addObjs.map((r) => r.name!);
      }
    }

    // Remove roles
    if (params.rolesToRemove && params.rolesToRemove.length > 0) {
      const removeObjs = params.rolesToRemove
        .map((name) => nameToRole[name])
        .filter(Boolean);
      
      if (removeObjs.length !== params.rolesToRemove.length) {
        errors.push("Some roles to remove not found");
      }
      
      if (removeObjs.length > 0) {
        await this.client.users.delClientRoleMappings({
          id: params.userId,
          realm: params.realm,
          clientUniqueId: client.id,
          roles: removeObjs,
        });
        removed = removeObjs.map((r) => r.name!);
      }
    }

    return { client, added, removed, errors };
  }

  async resetUserPassword(params: {
    realm: string;
    userId: string;
    password: string;
    temporary?: boolean;
  }) {
    await this.authenticate();
    this.client.setConfig({ realmName: params.realm });

    await this.client.users.resetPassword({
      id: params.userId,
      realm: params.realm,
      credential: {
        type: "password",
        value: params.password,
        temporary: params.temporary || false,
      },
    });
  }
}

// Function to create and configure the MCP server
export async function createKeycloakMcpServer(config: KeycloakConfig): Promise<Server> {
  let validatedConfig;
  try {
    validatedConfig = ConfigSchema.parse(config);
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid configuration: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Create Keycloak service instance
  const keycloakService = new KeycloakService(validatedConfig);

  // Create server instance
  const server = new Server(
    {
      name: "@octodet/keycloak-mcp",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "create-user",
          description: "Create a new user in a specific realm",
          inputSchema: {
            type: "object",
            properties: {
              realm: { type: "string", description: "Realm name" },
              username: { type: "string", description: "Username for the new user" },
              email: { type: "string", format: "email", description: "Email address for the new user" },
              firstName: { type: "string", description: "First name of the user" },
              lastName: { type: "string", description: "Last name of the user" },
              enabled: { type: "boolean", description: "Whether the user is enabled", default: true },
              emailVerified: { type: "boolean", description: "Whether the email is verified" },
              credentials: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", description: "Credential type (e.g., 'password')" },
                    value: { type: "string", description: "Credential value" },
                    temporary: { type: "boolean", description: "Whether the credential is temporary" },
                  },
                  required: ["type", "value"],
                },
                description: "User credentials",
              },
            },
            required: ["realm", "username", "email", "firstName", "lastName"],
          },
        },
        {
          name: "delete-user",
          description: "Delete a user from a specific realm",
          inputSchema: {
            type: "object",
            properties: {
              realm: { type: "string", description: "Realm name" },
              userId: { type: "string", description: "User ID to delete" },
            },
            required: ["realm", "userId"],
          },
        },
        {
          name: "list-realms",
          description: "List all available realms",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        {
          name: "list-users",
          description: "List users in a specific realm",
          inputSchema: {
            type: "object",
            properties: {
              realm: { type: "string", description: "Realm name" },
            },
            required: ["realm"],
          },
        },
        {
          name: "list-roles",
          description: "List all roles of a specific client in a specific realm",
          inputSchema: {
            type: "object",
            properties: {
              realm: { type: "string", description: "Realm name" },
              clientId: { type: "string", description: "Client ID" },
            },
            required: ["realm", "clientId"],
          },
        },
        {
          name: "update-user-roles",
          description: "Add and/or remove client roles for a user in a specific realm and client",
          inputSchema: {
            type: "object",
            properties: {
              realm: { type: "string", description: "Realm name" },
              userId: { type: "string", description: "User ID" },
              clientId: { type: "string", description: "Client ID" },
              rolesToAdd: { type: "array", items: { type: "string" }, description: "Roles to add" },
              rolesToRemove: { type: "array", items: { type: "string" }, description: "Roles to remove" },
            },
            required: ["realm", "userId", "clientId"],
          },
        },
        {
          name: "reset-user-password",
          description: "Reset or set a new password for a user in a specific realm",
          inputSchema: {
            type: "object",
            properties: {
              realm: { type: "string", description: "Realm name" },
              userId: { type: "string", description: "User ID" },
              password: { type: "string", description: "New password" },
              temporary: { type: "boolean", description: "Whether the password is temporary", default: false },
            },
            required: ["realm", "userId", "password"],
          },
        },
      ],
    };
  });

  // Tool schemas for validation
  const CreateUserSchema = z.object({
    realm: z.string(),
    username: z.string(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    enabled: z.boolean().default(true),
    emailVerified: z.boolean().optional(),
    credentials: z
      .array(
        z.object({
          type: z.string(),
          value: z.string(),
          temporary: z.boolean().optional(),
        })
      )
      .optional(),
  });

  const DeleteUserSchema = z.object({
    realm: z.string(),
    userId: z.string(),
  });

  const ListUsersSchema = z.object({
    realm: z.string(),
  });

  const ListRolesSchema = z.object({
    realm: z.string(),
    clientId: z.string(),
  });

  const UpdateUserRolesSchema = z.object({
    realm: z.string(),
    userId: z.string(),
    clientId: z.string(),
    rolesToAdd: z.array(z.string()).optional(),
    rolesToRemove: z.array(z.string()).optional(),
  });

  const ResetUserPasswordSchema = z.object({
    realm: z.string(),
    userId: z.string(),
    password: z.string(),
    temporary: z.boolean().default(false),
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "create-user": {
          const params = CreateUserSchema.parse(args);
          const user = await keycloakService.createUser(params);
          return {
            content: [
              {
                type: "text",
                text: `User created successfully. User ID: ${user.id}`,
              },
            ],
          };
        }

        case "delete-user": {
          const { realm, userId } = DeleteUserSchema.parse(args);
          await keycloakService.deleteUser(realm, userId);
          return {
            content: [
              {
                type: "text",
                text: `User ${userId} deleted successfully from realm ${realm}`,
              },
            ],
          };
        }

        case "list-realms": {
          const realms = await keycloakService.listRealms();
          return {
            content: [
              {
                type: "text",
                text: `Available realms:\n${realms
                  .map((r) => `- ${r.realm}`)
                  .join("\n")}`,
              },
            ],
          };
        }

        case "list-users": {
          const { realm } = ListUsersSchema.parse(args);
          const users = await keycloakService.listUsers(realm);
          return {
            content: [
              {
                type: "text",
                text: `Users in realm ${realm}:\n${users
                  .map((u) => `- ${u.username} (${u.id})`)
                  .join("\n")}`,
              },
            ],
          };
        }

        case "list-roles": {
          const { realm, clientId } = ListRolesSchema.parse(args);
          const { client, roles } = await keycloakService.listRoles(realm, clientId);
          return {
            content: [
              {
                type: "text",
                text: `Roles for client '${client.clientId}' in realm '${realm}':\n${roles
                  .map((r) => `- ${r.name}`)
                  .join("\n")}`,
              },
            ],
          };
        }

        case "update-user-roles": {
          const params = UpdateUserRolesSchema.parse(args);
          const { client, added, removed, errors } = await keycloakService.updateUserRoles(params);
          return {
            content: [
              {
                type: "text",
                text: `Client roles updated for user ${params.userId} in realm ${params.realm} (client: ${
                  client.clientId
                }).\nAdded: ${added.join(", ") || "none"}\nRemoved: ${
                  removed.join(", ") || "none"
                }${errors.length ? `\nErrors: ${errors.join(", ")}` : ""}`,
              },
            ],
          };
        }

        case "reset-user-password": {
          const params = ResetUserPasswordSchema.parse(args);
          await keycloakService.resetUserPassword(params);
          return {
            content: [
              {
                type: "text",
                text: `Password ${params.temporary ? "temporarily " : ""}reset successfully for user ${params.userId} in realm ${params.realm}${
                  params.temporary ? ". User will be required to change password on next login." : "."
                }`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${error.errors
                .map((e) => `${e.path.join(".")}: ${e.message}`)
                .join(", ")}`,
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  });

  return server;
}

// Get Keycloak configuration from environment variables
const config: KeycloakConfig = {
  baseUrl: process.env.KEYCLOAK_URL || "http://localhost:8080",
  adminUsername: process.env.KEYCLOAK_ADMIN || "admin",
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || "admin",
};

// Main function to start the server
async function main(): Promise<void> {
  try {
    const transport = new StdioServerTransport();
    const server = await createKeycloakMcpServer(config);

    await server.connect(transport);
    console.error("@octodet/keycloak-mcp server running on stdio");

    // Handle termination signals
    process.on("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error(
      "Server error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
