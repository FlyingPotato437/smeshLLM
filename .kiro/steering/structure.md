# Project Structure

## Root Directory
- `my-app/` - Main Next.js application
- `SmokeSculpter/` - 3D smoke simulation project (separate TypeScript/WebGL project)
- `python-services/` - FastAPI backend services for ML/physics computations
- Various config files and documentation

## Main Application (`my-app/`)

### Core Directories
```
app/                    # Next.js App Router
├── api/               # API routes
│   ├── chat/          # AI chat endpoints
│   ├── ingest/        # Data ingestion endpoints
│   └── plume-predictions/ # ML prediction endpoints
├── dashboard/         # Dashboard page
├── chat/             # Chat interface page
├── visualization/    # 3D visualization page
├── sensors/          # Sensor management page
└── research/         # Research tools page

components/            # React components
├── ui/               # Reusable UI components
├── layout/           # Layout components
└── visualization/    # Visualization-specific components

lib/                  # Utility libraries
├── ai/               # AI/ML utilities
├── database/         # Database utilities
├── layers/           # Deck.gl layer definitions
├── services/         # External service integrations
└── utils/            # General utilities

supabase/             # Database schema and migrations
├── migrations/       # SQL migration files
└── .branches/        # Supabase branch info
```

### Key Files
- `app/layout.tsx` - Root layout with navigation
- `app/page.tsx` - Landing page
- `lib/database/supabase.ts` - Database client configuration
- `components/ui/smesh-chat.tsx` - Main chat interface
- `netlify.toml` - Deployment configuration

## Python Services (`python-services/`)
- `main.py` - FastAPI application entry point
- `*_service.py` - Individual service modules (HYSPLIT, OpenAQ, etc.)
- `requirements.txt` - Python dependencies
- `venv/` - Virtual environment

## Naming Conventions

### Files & Directories
- Use kebab-case for directories: `air-quality-dashboard/`
- Use kebab-case for component files: `smesh-chat.tsx`
- Use PascalCase for React components: `SmeshChat`
- Use camelCase for utilities and services: `dataIngestion.ts`

### Components
- UI components in `components/ui/`
- Layout components in `components/layout/`
- Page-specific components co-located with pages
- Use descriptive names: `enhanced-air-quality-dashboard.tsx`

### API Routes
- RESTful structure: `/api/resource/action`
- Use HTTP methods appropriately (GET, POST, PUT, DELETE)
- Group related endpoints: `/api/ingest/sensors`, `/api/ingest/fires`

### Database
- Snake_case for table names: `sensor_readings`, `fire_detections`
- Descriptive column names with units where applicable
- Use migrations for schema changes

## Import Patterns
- Use absolute imports with `@/` alias
- Group imports: external libraries, internal modules, types
- Prefer named exports over default exports for utilities