import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import KcAdminClient from "@keycloak/keycloak-admin-client";
import { z } from "zod";
import pkg from '../package.json' with { type: 'json' };

const server = new Server(
  {
    name: "@octodet/keycloak-mcp",
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool schemas
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
            realm: { type: "string" },
            username: { type: "string" },
            email: { type: "string", format: "email" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            enabled: { type: "boolean" },
            emailVerified: { type: "boolean" },
            credentials: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  value: { type: "string" },
                  temporary: { type: "boolean" },
                },
                required: ["type", "value"],
              },
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
            realm: { type: "string" },
            userId: { type: "string" },
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
            realm: { type: "string" },
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
            realm: { type: "string" },
            clientId: { type: "string" },
          },
          required: ["realm", "clientId"],
        },
      },
      {
        name: "update-user-roles",
        description:
          "Add and/or remove client roles for a user in a specific realm and client. Provide clientId, rolesToAdd and/or rolesToRemove as arrays of role names.",
        inputSchema: {
          type: "object",
          properties: {
            realm: { type: "string" },
            userId: { type: "string" },
            clientId: { type: "string" },
            rolesToAdd: { type: "array", items: { type: "string" } },
            rolesToRemove: { type: "array", items: { type: "string" } },
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
            realm: { type: "string" },
            userId: { type: "string" },
            password: { type: "string" },
            temporary: { type: "boolean" },
          },
          required: ["realm", "userId", "password"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Initialize Keycloak client
  const kcAdminClient = new KcAdminClient({
    baseUrl: process.env.KEYCLOAK_URL || "http://localhost:8080",
    realmName: "master",
  });
  // Authenticate before each request
  await kcAdminClient.auth({
    username: process.env.KEYCLOAK_ADMIN || "admin",
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || "admin",
    grantType: "password",
    clientId: "admin-cli",
  });

  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create-user": {
        const {
          realm,
          username,
          email,
          firstName,
          lastName,
          enabled,
          emailVerified,
          credentials,
        } = CreateUserSchema.parse(args);

        kcAdminClient.setConfig({
          realmName: realm,
        });

        const user = await kcAdminClient.users.create({
          realm,
          username,
          email,
          firstName,
          lastName,
          enabled: enabled !== undefined ? enabled : true,
          emailVerified,
          credentials,
        });

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

        kcAdminClient.setConfig({
          realmName: realm,
        });

        await kcAdminClient.users.del({
          id: userId,
          realm,
        });

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
        const realms = await kcAdminClient.realms.find();

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

        kcAdminClient.setConfig({
          realmName: realm,
        });

        const users = await kcAdminClient.users.find();

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
        kcAdminClient.setConfig({ realmName: realm });
        // Find the client by clientId (can be id or clientId string)
        let client = null;
        // Try to find by id first
        try {
          client = await kcAdminClient.clients.findOne({ realm, id: clientId });
        } catch {}
        if (!client) {
          // Try to find by clientId property
          const clients = await kcAdminClient.clients.find({ realm });
          client = clients.find(
            (c) => c.clientId === clientId || c.id === clientId
          );
        }
        if (!client) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Client '${clientId}' not found in realm '${realm}'.`,
              },
            ],
          };
        }
        if (!client.id || typeof client.id !== "string") {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Client found but has no valid id property.`,
              },
            ],
          };
        }
        // Get all roles for this client
        const roles = await kcAdminClient.clients.listRoles({
          realm,
          id: client.id,
        });
        return {
          content: [
            {
              type: "text",
              text: `Roles for client '${
                client.clientId
              }' in realm '${realm}':\n${roles
                .map((r) => `- ${r.name}`)
                .join("\n")}`,
            },
          ],
        };
      }
      case "update-user-roles": {
        const { realm, userId, clientId, rolesToAdd, rolesToRemove } =
          UpdateUserRolesSchema.parse(args);
        kcAdminClient.setConfig({ realmName: realm });
        let added = [],
          removed = [],
          errors = [];
        // Find the client by clientId (can be id or clientId string)
        let client = null;
        try {
          client = await kcAdminClient.clients.findOne({ realm, id: clientId });
        } catch {}
        if (!client) {
          const clients = await kcAdminClient.clients.find({ realm });
          client = clients.find(
            (c) => c.clientId === clientId || c.id === clientId
          );
        }
        if (!client || !client.id || typeof client.id !== "string") {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Client '${clientId}' not found or invalid in realm '${realm}'.`,
              },
            ],
          };
        }
        // Fetch all roles for this client
        const allRoles = await kcAdminClient.clients.listRoles({
          realm,
          id: client.id,
        });
        const nameToRole = Object.fromEntries(allRoles.map((r) => [r.name, r]));
        if (rolesToAdd && rolesToAdd.length > 0) {
          const addObjs = rolesToAdd
            .map((name) => nameToRole[name])
            .filter(Boolean);
          if (addObjs.length !== rolesToAdd.length)
            errors.push("Some roles to add not found");
          if (addObjs.length > 0) {
            await kcAdminClient.users.addClientRoleMappings({
              id: userId,
              realm,
              clientUniqueId: client.id,
              roles: addObjs,
            });
            added = addObjs.map((r) => r.name);
          }
        }
        if (rolesToRemove && rolesToRemove.length > 0) {
          const removeObjs = rolesToRemove
            .map((name) => nameToRole[name])
            .filter(Boolean);
          if (removeObjs.length !== rolesToRemove.length)
            errors.push("Some roles to remove not found");
          if (removeObjs.length > 0) {
            await kcAdminClient.users.delClientRoleMappings({
              id: userId,
              realm,
              clientUniqueId: client.id,
              roles: removeObjs,
            });
            removed = removeObjs.map((r) => r.name);
          }
        }
        return {
          content: [
            {
              type: "text",
              text: `Client roles updated for user ${userId} in realm ${realm} (client: ${
                client.clientId
              }).\nAdded: ${added.join(", ") || "none"}\nRemoved: ${
                removed.join(", ") || "none"
              }${errors.length ? `\nErrors: ${errors.join(", ")}` : ""}`,
            },
          ],
        };
      }

      case "reset-user-password": {
        const { realm, userId, password, temporary } = ResetUserPasswordSchema.parse(args);

        kcAdminClient.setConfig({
          realmName: realm,
        });

        await kcAdminClient.users.resetPassword({
          id: userId,
          realm,
          credential: {
            type: "password",
            value: password,
            temporary: temporary,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Password ${temporary ? "temporarily " : ""}reset successfully for user ${userId} in realm ${realm}${temporary ? ". User will be required to change password on next login." : "."}`,
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
    throw error;
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("@octodet/keycloak-mcp server running on stdio");
