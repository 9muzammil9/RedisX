import * as persistence from '../services/persistence';
import {
  loadChannelMessages,
  removeChannelMessages,
  saveChannelMessages,
} from './messageStorage';
import {
  loadSubscriptions,
  removeSubscriptions,
  saveSubscriptions,
} from './subscriptionStorage';

export interface ConnectionMigration {
  oldId: string;
  newId: string;
}

export async function migrateConnectionData(
  migrations: ConnectionMigration[],
): Promise<void> {
  for (const { oldId, newId } of migrations) {
    console.log(`🔄 Migrating data from ${oldId} to ${newId}`);

    try {
      // Migrate subscriptions
      const subscriptions = loadSubscriptions(oldId);
      if (subscriptions.size > 0) {
        saveSubscriptions(newId, subscriptions);
        removeSubscriptions(oldId);

        // Also migrate to SQLite
        persistence
          .saveSubscriptions(newId, subscriptions)
          .catch(console.error);
        persistence.removeSubscriptions(oldId).catch(console.error);

        console.log(`✅ Migrated ${subscriptions.size} subscriptions`);

        // Migrate messages for each channel with persistence enabled
        for (const [channel, persistMessages] of subscriptions) {
          if (persistMessages) {
            const messages = loadChannelMessages(oldId, channel);
            if (messages.length > 0) {
              saveChannelMessages(newId, channel, messages);
              removeChannelMessages(oldId, channel);

              // Also migrate to SQLite
              persistence
                .saveChannelMessages(newId, channel, messages)
                .catch(console.error);
              persistence
                .removeChannelMessages(oldId, channel)
                .catch(console.error);

              console.log(
                `✅ Migrated ${messages.length} messages for channel ${channel}`,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `❌ Failed to migrate data for connection ${oldId}:`,
        error,
      );
    }
  }
}
