# Technology Stack

## Frontend Framework
- **Next.js 15.3.4** with App Router
- **React 19** with TypeScript
- **Tailwind CSS 4** for styling
- **Framer Motion** for animations

## Backend & Database
- **Supabase** for database and authentication
- **PostgreSQL** with real-time subscriptions
- **Python FastAPI** services for ML/physics computations
- **Netlify** for deployment and serverless functions

## Visualization & Mapping
- **Deck.gl 9.1.12** for 3D visualizations
- **React Map GL** for interactive maps
- **Three.js** for 3D rendering
- **Leaflet/React-Leaflet** for 2D mapping

## AI & Machine Learning
- **OpenAI GPT** for chat interface
- **Google Generative AI** integration
- **PyTorch & TensorFlow** for physics-informed neural networks
- **HYSPLIT** for atmospheric modeling
- **Sentence Transformers** for embeddings

## Data Processing
- **Python** with NumPy, Pandas, SciPy
- **xarray** for atmospheric data
- **NetCDF4** for meteorological data formats
- **OpenAQ API** for air quality data

## Development Tools
- **TypeScript** with strict mode
- **ESLint** for code quality
- **Turbopack** for fast development builds
- **tsx** for TypeScript execution

## Common Commands

### Development
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

### Database Operations
```bash
# Run database migrations
npm run db:migrate

# Test database connection
npm run db:test

# Seed database with test data
npm run db:seed
```

### Python Services
```bash
# Install Python dependencies
cd python-services && pip install -r requirements.txt

# Start Python API server
cd python-services && python main.py

# Run with uvicorn
cd python-services && uvicorn main:app --reload
```

## Environment Variables
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_AI_API_KEY` - Google AI API key