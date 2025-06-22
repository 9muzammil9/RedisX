import { connectionsApi } from "../services/api";
import { RedisConnection } from "../types";

export async function checkAndRecoverConnection(
  connection: RedisConnection
): Promise<RedisConnection> {
  try {
    // Check if connection exists on server
    const response = await connectionsApi.exists(connection.id);

    if (response.data.exists) {
      // Connection exists, return as-is
      return connection;
    } else {
      // Skip auto-recovery for local instance connections
      if (connection.name.startsWith("Local -")) {
        console.log(
          `⏭️ Skipping auto-recovery for local instance connection: ${connection.name}`
        );
        return connection;
      }

      // Connection doesn't exist on server, recreate it with the same ID
      console.log(
        `🔄 Connection ${connection.id} not found on server, recreating with same ID...`
      );

      const { data: restoredConnection } = await connectionsApi.create({
        id: connection.id, // Pass the existing ID
        name: connection.name,
        host: connection.host,
        port: connection.port,
        password: connection.password,
        db: connection.db,
        username: connection.username,
        tls: connection.tls,
      });

      console.log(
        `✅ Restored connection with original ID: ${restoredConnection.id}`
      );
      return restoredConnection;
    }
  } catch (error) {
    console.error(
      `❌ Failed to check/recover connection ${connection.id}:`,
      error
    );
    throw error;
  }
}

export async function recoverAllConnections(
  connections: RedisConnection[]
): Promise<{
  recoveredConnections: RedisConnection[];
  connectionMigrations: Array<{ oldId: string; newId: string }>;
}> {
  const recoveredConnections: RedisConnection[] = [];
  const connectionMigrations: Array<{ oldId: string; newId: string }> = [];

  for (const connection of connections) {
    try {
      const recovered = await checkAndRecoverConnection(connection);
      recoveredConnections.push(recovered);

      // Track if connection ID changed
      if (recovered.id !== connection.id) {
        connectionMigrations.push({
          oldId: connection.id,
          newId: recovered.id,
        });
      }
    } catch (error) {
      console.warn(`Failed to recover connection ${connection.name}:`, error);
      // Continue with other connections even if one fails
    }
  }

  return { recoveredConnections, connectionMigrations };
}
