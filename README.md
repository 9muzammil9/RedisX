# Redis Viewer

A modern, feature-rich Redis database viewer with support for multiple connections, bulk operations, and a clean UI with dark mode support.

## Features

### Connection Management
- **Multiple Database Connections**: Connect to multiple Redis instances simultaneously
- **Connection Persistence**: Saved connections persist across server restarts (passwords excluded for security)
- **Auto-reconnect**: One-click reconnection to saved Redis instances
- **Connection Status**: Visual indicators showing connection health

### Key Management
- **Hierarchical Key View**: Nested key visualization with collapsible groups (using `:` separator)
- **Create New Keys**: Add new Redis keys with support for all data types
- **Key Operations**: View, edit, delete, and update Redis keys and values
- **Bulk Operations**: Multi-select and bulk delete functionality
- **Key Search**: Pattern-based search with Redis glob patterns

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

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Query
- **Backend**: Node.js, Express, TypeScript, ioredis
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

This will start both the backend server (port 4000) and frontend client (port 3000).

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
2. **Search Keys**: Use Redis glob patterns (e.g., `user:*`, `cache:session:*`)
3. **Create Keys**: Click the "+" button in the key list to create new keys
4. **Select Multiple**: Use checkboxes to select multiple keys for bulk operations
5. **Edit Values**: Click on any key to view and edit its value in the right panel

### Advanced Features
- **Collapsible Groups**: Click folder icons to expand/collapse key groups
- **Individual Element Editing**: For lists and arrays, edit individual elements instead of the entire structure
- **Dark Mode**: Toggle theme using the switch in the header
- **Hide Panels**: Collapse the connections panel for more workspace
- **Persistent Connections**: Your connections are saved and can be reconnected after server restarts

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

## License

MIT