# Octodet Keycloak MCP Server

[![npm version](https://img.shields.io/npm/v/@octodet/keycloak-mcp.svg)](https://www.npmjs.com/package/@octodet/keycloak-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful Model Context Protocol server for Keycloak administration, providing a comprehensive set of tools to manage users, realms, roles, and other Keycloak resources through LLM interfaces.

<a href="https://glama.ai/mcp/servers/@Octodet/keycloak-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Octodet/keycloak-mcp/badge" alt="Advanced Keycloak server MCP server" />
</a>

## Features

- **User Management**: Create, delete, and list users across realms
- **Realm Administration**: Comprehensive realm management capabilities
- **Secure Integration**: Authentication with admin credentials
- **Easy Configuration**: Simple setup with environment variables
- **LLM Integration**: Seamless use with Claude, ChatGPT, and other MCP-compatible AI assistants

## Installation

### Via NPM (Recommended)

The server is available as an NPM package:

```bash
# Direct usage with npx
npx -y @octodet/keycloak-mcp

# Or global installation
npm install -g @octodet/keycloak-mcp
```

## Configuration

### Environment Variables

| Variable                | Description         | Default               |
| ----------------------- | ------------------- | --------------------- |
| KEYCLOAK_URL            | Keycloak server URL | http://localhost:8080 |
| KEYCLOAK_ADMIN          | Admin username      | admin                 |
| KEYCLOAK_ADMIN_PASSWORD | Admin password      | admin                 |
| KEYCLOAK_REALM          | Default realm       | master                |

### MCP Client Configuration

#### VS Code

Add this to your `settings.json`:

```json
{
  "mcp.servers": {
    "keycloak": {
      "command": "npx",
      "args": ["-y", "@octodet/keycloak-mcp"],
      "env": {
        "KEYCLOAK_URL": "http://localhost:8080",
        "KEYCLOAK_ADMIN": "admin",
        "KEYCLOAK_ADMIN_PASSWORD": "admin"
      }
    }
  }
}
```

#### Claude Desktop

Configure in your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "keycloak": {
      "command": "npx",
      "args": ["-y", "@octodet/keycloak-mcp"],
      "env": {
        "KEYCLOAK_URL": "http://localhost:8080",
        "KEYCLOAK_ADMIN": "admin",
        "KEYCLOAK_ADMIN_PASSWORD": "admin"
      }
    }
  }
}
```

#### For Local Development

```json
{
  "mcpServers": {
    "keycloak": {
      "command": "node",
      "args": ["path/to/build/index.js"],
      "env": {
        "KEYCLOAK_URL": "http://localhost:8080",
        "KEYCLOAK_ADMIN": "admin",
        "KEYCLOAK_ADMIN_PASSWORD": "admin"
      }
    }
  }
}
```

## Available Tools

The server provides a comprehensive set of MCP tools for Keycloak administration. Each tool is designed to perform specific administrative tasks across realms, users, and roles.

### 📋 Tool Overview

| Tool                | Category         | Description                            |
| ------------------- | ---------------- | -------------------------------------- |
| `create-user`       | User Management  | Create a new user in a specified realm |
| `delete-user`       | User Management  | Delete an existing user from a realm   |
| `list-users`        | User Management  | List all users in a specified realm    |
| `list-realms`       | Realm Management | List all available realms              |
| `list-roles`        | Role Management  | List all roles for a specific client   |
| `update-user-roles` | Role Management  | Add or remove client roles for a user  |

---

### 👥 User Management

#### `create-user`

Creates a new user in a specified realm with comprehensive user attributes and optional credentials.

**Required Parameters:**

- `realm` (string): Target realm name
- `username` (string): Unique username for the new user
- `email` (string): Valid email address
- `firstName` (string): User's first name
- `lastName` (string): User's last name

**Optional Parameters:**

- `enabled` (boolean): Enable/disable user account (default: `true`)
- `emailVerified` (boolean): Mark email as verified
- `credentials` (array): Array of credential objects for setting passwords

**Credential Object Structure:**

- `type` (string): Credential type (e.g., "password")
- `value` (string): The credential value
- `temporary` (boolean): Whether password must be changed on first login

**Example Usage:**

```json
{
  "realm": "my-app-realm",
  "username": "john.doe",
  "email": "john.doe@company.com",
  "firstName": "John",
  "lastName": "Doe",
  "enabled": true,
  "emailVerified": true,
  "credentials": [
    {
      "type": "password",
      "value": "TempPassword123!",
      "temporary": true
    }
  ]
}
```

**Response:** Returns the created user ID and confirmation message.

---

#### `delete-user`

Permanently removes a user from the specified realm. This action cannot be undone.

**Required Parameters:**

- `realm` (string): Target realm name
- `userId` (string): Unique identifier of the user to delete

**Example Usage:**

```json
{
  "realm": "my-app-realm",
  "userId": "8f5c21e3-7c9d-4b5a-9f3e-8d4f6a2e7b1c"
}
```

**Response:** Confirmation message of successful deletion.

**⚠️ Warning:** This operation is irreversible. Ensure you have the correct user ID before execution.

---

#### `list-users`

Retrieves a list of all users in the specified realm with their basic information.

**Required Parameters:**

- `realm` (string): Target realm name

**Example Usage:**

```json
{
  "realm": "my-app-realm"
}
```

**Response:** Returns a formatted list showing usernames and user IDs for all users in the realm.

---

### 🏛️ Realm Management

#### `list-realms`

Retrieves all available realms in the Keycloak instance.

**Parameters:** None required

**Example Usage:**

```json
{}
```

**Response:** Returns a list of all realm names available in the Keycloak installation.

**Use Cases:**

- Discovering available realms
- Validating realm names before other operations
- Administrative overview of the Keycloak setup

---

### 🔐 Role Management

#### `list-roles`

Lists all roles defined for a specific client within a realm. Useful for understanding available permissions and roles before assignment.

**Required Parameters:**

- `realm` (string): Target realm name
- `clientId` (string): Client ID or UUID of the target client

**Example Usage:**

```json
{
  "realm": "my-app-realm",
  "clientId": "my-application"
}
```

**Alternative with Client UUID:**

```json
{
  "realm": "my-app-realm",
  "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response:** Returns a formatted list of all role names available for the specified client.

**💡 Tip:** You can use either the client's human-readable ID or its UUID identifier.

---

#### `update-user-roles`

Manages client role assignments for a user. Allows both adding and removing roles in a single operation.

**Required Parameters:**

- `realm` (string): Target realm name
- `userId` (string): User's unique identifier
- `clientId` (string): Client ID or UUID

**Optional Parameters:**

- `rolesToAdd` (array): List of role names to assign to the user
- `rolesToRemove` (array): List of role names to remove from the user

**Example Usage - Adding Roles:**

```json
{
  "realm": "my-app-realm",
  "userId": "8f5c21e3-7c9d-4b5a-9f3e-8d4f6a2e7b1c",
  "clientId": "my-application",
  "rolesToAdd": ["admin", "user-manager", "report-viewer"]
}
```

**Example Usage - Removing Roles:**

```json
{
  "realm": "my-app-realm",
  "userId": "8f5c21e3-7c9d-4b5a-9f3e-8d4f6a2e7b1c",
  "clientId": "my-application",
  "rolesToRemove": ["temporary-access", "beta-tester"]
}
```

**Example Usage - Combined Operation:**

```json
{
  "realm": "my-app-realm",
  "userId": "8f5c21e3-7c9d-4b5a-9f3e-8d4f6a2e7b1c",
  "clientId": "my-application",
  "rolesToAdd": ["senior-user"],
  "rolesToRemove": ["junior-user", "trainee"]
}
```

**Response:** Detailed summary of roles added, removed, and any errors encountered.

**🔍 Notes:**

- At least one of `rolesToAdd` or `rolesToRemove` must be provided
- Non-existent roles are skipped with warnings
- The operation is atomic per role list (all or none for each operation type)

---

### 🚀 Usage Tips

1. **User IDs vs Usernames**: Most operations require user IDs (UUIDs), not usernames. Use `list-users` to find the correct user ID.

2. **Client Identification**: The `clientId` parameter accepts both human-readable client IDs and UUID identifiers.

3. **Realm Validation**: Always verify realm names using `list-realms` before performing operations.

4. **Role Discovery**: Use `list-roles` to discover available roles before attempting role assignments.

5. **Error Handling**: All tools provide detailed error messages for troubleshooting authentication, permission, or parameter issues.

## Development

### Setting Up Your Development Environment

```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install

# Start the development server with watch mode
npm run watch
```

### Adding New Tools

To add a new tool to the server:

1. Define the tool schema in `src/index.ts` using Zod
2. Add the tool definition to the `ListToolsRequestSchema` handler
3. Implement the tool handler in the `CallToolRequestSchema` switch statement
4. Update this README to document the new tool

## Testing

### Using MCP Inspector

The MCP Inspector is a great tool for testing your MCP server:

```bash
npx -y @modelcontextprotocol/inspector npx -y @octodet/keycloak-mcp
```

### Integration Testing

For testing with a local Keycloak instance:

```bash
# Start Keycloak with Docker
docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev

# In another terminal, run the MCP server
npm run build
node build/index.js
```

## Deployment

### NPM Package

This project is published to NPM under [@octodet/keycloak-mcp](https://www.npmjs.com/package/@octodet/keycloak-mcp).

### Automated Deployment

This project uses GitHub Actions for CI/CD to automatically test and publish to NPM when a new release is created.

## Prerequisites

- Node.js 18 or higher
- Running Keycloak instance

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Octodet - Building intelligent tools for developers