# Redis Viewer

A modern, feature-rich Redis database viewer with support for multiple connections, bulk operations, real-time pub/sub monitoring, and a clean UI with dark mode support.

## Features

### Connection Management
- **Multiple Database Connections**: Connect to multiple Redis instances simultaneously
- **Connection Persistence**: Saved connections persist across server restarts with SQLite backup
- **Smart Password Management**: Option to keep existing passwords when editing connections
- **Auto-reconnect**: One-click reconnection to saved Redis instances with preserved connection IDs
- **Connection Recovery**: Automatic connection restoration after server restarts
- **Connection Status**: Visual indicators showing connection health
- **Easy Connection Editing**: Click server icons to edit connection details

### Key Management
- **Hierarchical Key View**: Nested key visualization with collapsible groups (using `:` separator)
- **Resizable Keys Panel**: Adjustable panel width with minimum constraints and persistent sizing
- **Create New Keys**: Add new Redis keys with support for all data types
- **Key Operations**: View, edit, delete, and update Redis keys and values
- **Bulk Operations**: Multi-select and bulk delete functionality
- **Key Search**: Pattern-based search with Redis glob patterns
- **Right-click Context Menu**: Export, copy, edit, and delete keys via context menu
- **Export/Import**: Export individual keys or groups in JSON, Redis CLI, and CSV formats
- **Auto Tab Switching**: Automatically switches to Keys & Values tab when selecting a key

### Data Type Support
- **String**: Simple text values
- **List**: Ordered collections with individual element editing
- **Hash**: Key-value pairs within keys
- **Set**: Unique value collections
- **Sorted Set (ZSet)**: Scored value collections
- **Individual Element Editing**: Edit list and array elements separately instead of entire structures

### User Experience
- **Dark Mode**: Toggle between light and dark themes with persistent preference
- **Collapsible Panels**: Hide/show connections panel for more workspace
- **Smart View Modes**: Automatic selection of optimal view based on data type and size
- **Tree Visualization**: JSON tree view for complex nested data
- **TTL Management**: View and modify key expiration times
- **Real-time Updates**: Live data refresh and status updates
- **Tab State Persistence**: Remembers your active tab (Keys/Values or Pub/Sub) across refreshes

### Pub/Sub Features
- **Real-time Channel Monitoring**: View all active Redis pub/sub channels
- **Live Message Streaming**: Real-time message updates via WebSocket connection
- **Channel Subscriptions**: Subscribe to multiple channels simultaneously
- **Message Publishing**: Send messages to any channel with instant delivery
- **Subscription Persistence**: Subscribed channels persist across app restarts and server restarts
- **Message History**: Optional message persistence per channel with toggle switches
- **Message Management**: Delete individual messages or clear all messages
- **Channel Statistics**: View subscriber counts and channel activity
- **WebSocket Auto-reconnect**: Automatic reconnection with subscription restoration
- **Message Deduplication**: Prevents duplicate messages from appearing
- **Pattern-based Channel Search**: Filter channels using Redis glob patterns
- **Data Recovery**: Messages and subscriptions automatically restored after connection issues

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Query
- **Backend**: Node.js, Express, TypeScript, ioredis, WebSocket (ws)
- **Database**: SQLite with better-sqlite3 for data persistence
- **UI Components**: Radix UI, Lucide Icons, react-json-view-lite
- **Development**: ESLint, Prettier, Concurrently

## Requirements

- Node.js 18+ 
- npm or yarn
- Redis server (for connections)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd redis-viewer
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

This will start both the backend server (port 4000) with WebSocket support and frontend client (port 3000).

## Environment Variables

Create a `.env` file in the server directory for configuration:

```bash
# Server Configuration
PORT=4000
NODE_ENV=development

# CORS (optional)
ALLOWED_ORIGINS=http://localhost:3000
```

## Usage

### Getting Started
1. Open http://localhost:3000 in your browser
2. Click the "+" button in the connections panel to add a new Redis connection
3. Enter your Redis server details (host, port, password if required)
4. Click "Connect" to establish the connection

### Working with Keys
1. **Browse Keys**: Use the hierarchical tree view to navigate your key structure
2. **Resize Panel**: Drag the panel edge to adjust the keys panel width to your preference
3. **Search Keys**: Use Redis glob patterns (e.g., `user:*`, `cache:session:*`)
4. **Create Keys**: Click the "+" button in the key list to create new keys
5. **Select Multiple**: Use checkboxes to select multiple keys for bulk operations
6. **Edit Values**: Click on any key to automatically switch to Keys & Values tab and view/edit its value
7. **Right-click Actions**: Right-click on keys for quick access to export, copy, edit, and delete options
8. **Export Data**: Export individual keys or entire groups in multiple formats (JSON, Redis CLI, CSV)

### Working with Pub/Sub
1. **Access Pub/Sub**: Click the "Pub/Sub" tab in the main interface
2. **View Channels**: Browse all active channels with subscriber counts
3. **Subscribe to Channels**: Use the Subscribe tab to monitor channels in real-time
4. **Publish Messages**: Send messages to any channel via the Publish tab
5. **Message History**: Toggle message persistence per channel for history across restarts
6. **Message Management**: Delete individual messages or clear all messages with database persistence
7. **Statistics**: View channel statistics and subscriber information
8. **Pattern Filtering**: Use Redis glob patterns to filter channels (e.g., `user:*`, `notification:*`)
9. **Auto Recovery**: Subscriptions and messages automatically restored after server restarts

### Advanced Features
- **Collapsible Groups**: Click folder icons to expand/collapse key groups
- **Individual Element Editing**: For lists and arrays, edit individual elements instead of the entire structure
- **Context Menu Operations**: Right-click any key or group for quick actions
- **Multi-format Export**: Export data as JSON, Redis CLI commands, or CSV
- **Smart Edit Mode**: Context menu "Edit Key" opens keys directly in edit mode
- **Dark Mode**: Toggle theme using the switch in the header
- **Hide Panels**: Collapse the connections panel for more workspace
- **Persistent Connections**: Your connections are saved and can be reconnected after server restarts
- **Real-time Pub/Sub**: WebSocket-based real-time message monitoring with auto-reconnect
- **Tab Persistence**: Application remembers your active tab and sub-tabs across page refreshes
- **Resizable Interface**: Drag panel edges to customize layout with persistent sizing
- **Auto Tab Switching**: Clicking keys automatically switches to the appropriate tab
- **Data Persistence**: SQLite backup ensures data survives server restarts
- **Keyboard Accessibility**: Full keyboard navigation support for all interactive elements

## Project Structure

```
redis-viewer/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── services/     # API services
│   │   ├── store/        # Zustand state management
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Utility functions
│   └── ...
├── server/               # Express backend
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── middleware/   # Express middleware
│   │   └── types/        # TypeScript types
│   └── ...
└── package.json          # Root package.json with workspaces
```

## API Endpoints

### Connections
- `POST /api/connections` - Create a new connection
- `GET /api/connections` - Get all connections
- `DELETE /api/connections/:id` - Delete a connection
- `GET /api/connections/:id/info` - Get Redis server info

### Keys
- `GET /api/keys` - Get keys (with pagination and pattern matching)
- `GET /api/keys/value` - Get value for a specific key
- `PUT /api/keys/value` - Update key value
- `DELETE /api/keys` - Delete multiple keys
- `PUT /api/keys/rename` - Rename a key

### Pub/Sub
- `GET /api/pubsub/channels` - Get all active channels
- `GET /api/pubsub/stats` - Get channel statistics
- `POST /api/pubsub/publish` - Publish message to a channel
- `WebSocket /ws` - Real-time pub/sub messaging (subscribe, unsubscribe, message streaming)

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start both client and server
npm run dev:client       # Start frontend only (port 3000)
npm run dev:server       # Start backend only (port 4000)

# Build
npm run build            # Build both client and server
npm run build:client     # Build frontend only
npm run build:server     # Build backend only

# Code Quality
npm run lint --workspaces    # Lint all workspaces
npm run typecheck --workspaces # Type check all workspaces
```

### Project Architecture

This is a monorepo using npm workspaces with:
- **Client**: React SPA with TypeScript and Vite
- **Server**: Express REST API with TypeScript
- **Shared**: Common types and utilities

### Adding New Features

1. **New UI Components**: Add to `client/src/components/`
2. **API Endpoints**: Add to `server/src/routes/`
3. **State Management**: Use Zustand store in `client/src/store/`
4. **Utilities**: Add shared utilities to respective `utils/` directories

## Screenshots

### Light Mode
- Clean, modern interface with intuitive navigation
- Hierarchical key browser with expandable groups
- Tabbed view modes for different data visualizations

### Dark Mode
- Full dark theme support with consistent styling
- Automatic theme persistence across sessions
- Optimized for extended usage and reduced eye strain

## Troubleshooting

### Common Issues

**Connection Failed**
- Verify Redis server is running and accessible
- Check host, port, and authentication credentials
- Ensure firewall allows connections to Redis port

**Keys Not Loading**
- Check Redis connection status (green indicator)
- Verify you have READ permissions on the database
- Try refreshing the connection

**Pub/Sub Issues**
- Ensure WebSocket connection is active (green indicator)
- Check browser console for WebSocket connection errors
- Verify Redis server supports pub/sub operations
- Try disconnecting and reconnecting WebSocket

**Performance Issues**
- Use key patterns to limit results (e.g., `user:*` instead of `*`)
- Enable pagination for large datasets
- Consider using more specific search patterns
- Limit pub/sub subscriptions to essential channels only

**UI Issues**
- Hard refresh (Ctrl+F5) to clear cache
- Check browser console for JavaScript errors
- Ensure JavaScript is enabled

### Development Issues

**Port Already in Use**
```bash
# Kill processes using ports 3000 or 4000
npx kill-port 3000 4000
```

**Module Resolution Errors**
```bash
# Clear node_modules and reinstall
rm -rf node_modules client/node_modules server/node_modules
npm install
```

**TypeScript Errors**
```bash
# Run type checking to see all errors
npm run typecheck --workspaces
```

## Security Considerations

- **Password Management**: Connection passwords are persisted locally but can be optionally changed when editing connections
- **Connection Editing**: "Keep existing password" option provides security and convenience balance
- **Network**: Use TLS/SSL connections for production Redis instances
- **Access**: Limit Redis access to trusted networks
- **Authentication**: Always use Redis AUTH for public-facing instances
- **Local Storage**: Connection data is stored in browser's localStorage

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style and conventions
- Add TypeScript types for all new code
- Test your changes thoroughly
- Update documentation as needed
- Ensure all linting and type checks pass

## Roadmap

- [x] Export/Import functionality for key data
- [x] Right-click context menus for key operations
- [x] Smart connection editing with password management
- [x] Bulk import functionality
- [x] Redis pub/sub monitoring with WebSocket
- [x] Real-time message streaming and subscriptions
- [x] Message persistence and history
- [x] Tab state persistence across refreshes
- [x] SQLite data persistence and backup
- [x] Connection recovery after server restarts
- [x] Individual message deletion
- [x] Resizable interface panels
- [x] Auto tab switching for improved UX
- [x] Keyboard accessibility support
- [ ] Query builder for complex Redis operations
- [ ] Performance monitoring and metrics
- [ ] Multi-database support within single connection
- [ ] Key diff and comparison tools
- [ ] Backup and restore functionality
- [ ] Advanced export filtering options
- [ ] Redis Cluster support
- [ ] Authentication and user management
- [ ] Advanced message filtering and search

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing issues for solutions
- Contribute via pull requests