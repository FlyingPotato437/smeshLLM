#!/bin/bash
# SmeshLLM AI Service Migration Script
# Usage: ./migrate-ai-service.sh [openai|claude|azure|local]

set -e

PROJECT_ROOT="/Users/srikanthsamy1/Desktop/StanfordUniversity/smeshLLM/my-app"
BACKUP_DIR="./migration-backup-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if service type is provided
if [ $# -eq 0 ]; then
    error "Usage: $0 [openai|claude|azure|local]"
fi

SERVICE_TYPE="$1"

log "Starting SmeshLLM AI Service Migration to: $SERVICE_TYPE"

# Navigate to project root
cd "$PROJECT_ROOT" || error "Could not find project directory: $PROJECT_ROOT"

# Create backup
log "Creating backup..."
mkdir -p "$BACKUP_DIR"
cp -r lib/ai/ "$BACKUP_DIR/"
cp -r app/api/chat/ "$BACKUP_DIR/"
cp package.json "$BACKUP_DIR/"
cp .env.local "$BACKUP_DIR/" 2>/dev/null || warn "No .env.local found to backup"
success "Backup created at: $BACKUP_DIR"

# Stop running services
log "Stopping existing services..."
pkill -f "npm run dev" || warn "No Next.js dev server running"
pkill -f "python main.py" || warn "No Python backend running"

case "$SERVICE_TYPE" in
    "openai")
        log "Migrating to OpenAI GPT-4 Turbo..."
        
        # Install OpenAI SDK if not present
        if ! npm list openai &>/dev/null; then
            log "Installing OpenAI SDK..."
            npm install openai
        fi
        
        # Update smesh-llm.ts for OpenAI
        log "Updating LLM client configuration..."
        cat > lib/ai/smesh-llm-openai.ts << 'EOF'
import OpenAI from 'openai';

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (typeof window !== 'undefined') {
      throw new Error('OpenAI client should not be initialized on the client side');
    }
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    openaiClient = new OpenAI({
      apiKey: apiKey,
      timeout: 60000
    });
    
    console.log('🧠 REAL LLM: Initialized OpenAI GPT-4 Turbo for atmospheric intelligence');
  }
  return openaiClient;
}

// Replace the Gemini client getter with OpenAI
export { getOpenAIClient as getGeminiClient };
EOF
        
        # Update environment template
        log "Creating OpenAI environment template..."
        cat >> .env.example << 'EOF'

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview
EOF
        
        success "OpenAI migration template created"
        warn "Please update .env.local with OPENAI_API_KEY"
        ;;
        
    "claude")
        log "Migrating to Anthropic Claude..."
        
        # Install Claude SDK
        log "Installing Anthropic SDK..."
        npm install @anthropic-ai/sdk
        
        # Create Claude adapter
        log "Creating Claude integration adapter..."
        cat > lib/ai/smesh-llm-claude.ts << 'EOF'
import Anthropic from '@anthropic-ai/sdk';

// Initialize Claude client
let claudeClient: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    if (typeof window !== 'undefined') {
      throw new Error('Claude client should not be initialized on the client side');
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    claudeClient = new Anthropic({
      apiKey: apiKey,
      timeout: 60000
    });
    
    console.log('🧠 REAL LLM: Initialized Anthropic Claude for atmospheric intelligence');
  }
  return claudeClient;
}

// Tool calling adapter for Claude format
export function adaptToolsForClaude(openaiTools: any[]) {
  return openaiTools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters
  }));
}

export { getClaudeClient as getGeminiClient };
EOF
        
        # Update environment template
        cat >> .env.example << 'EOF'

# Anthropic Claude Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
EOF
        
        success "Claude migration template created"
        warn "Please update .env.local with ANTHROPIC_API_KEY"
        warn "Note: Claude uses different function calling format - manual adaptation required"
        ;;
        
    "azure")
        log "Migrating to Azure OpenAI..."
        
        # Install Azure OpenAI SDK
        log "Installing Azure OpenAI SDK..."
        npm install openai
        
        # Create Azure adapter
        cat > lib/ai/smesh-llm-azure.ts << 'EOF'
import OpenAI from 'openai';

// Initialize Azure OpenAI client
let azureClient: OpenAI | null = null;

function getAzureClient(): OpenAI {
  if (!azureClient) {
    if (typeof window !== 'undefined') {
      throw new Error('Azure OpenAI client should not be initialized on the client side');
    }
    
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_DEPLOYMENT_NAME;
    
    if (!apiKey || !endpoint || !deployment) {
      throw new Error('Azure OpenAI environment variables are required');
    }
    
    azureClient = new OpenAI({
      apiKey: apiKey,
      baseURL: `https://${endpoint}.openai.azure.com/openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': '2024-02-15-preview' },
      timeout: 60000
    });
    
    console.log('🧠 REAL LLM: Initialized Azure OpenAI for atmospheric intelligence');
  }
  return azureClient;
}

export { getAzureClient as getGeminiClient };
EOF
        
        # Update environment template
        cat >> .env.example << 'EOF'

# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_api_key_here
AZURE_OPENAI_ENDPOINT=your_resource_name
AZURE_DEPLOYMENT_NAME=your_deployment_name
AZURE_API_VERSION=2024-02-15-preview
EOF
        
        success "Azure OpenAI migration template created"
        warn "Please update .env.local with Azure OpenAI credentials"
        ;;
        
    "local")
        log "Migrating to local LLM (Ollama)..."
        
        # Check if Ollama is installed
        if ! command -v ollama &> /dev/null; then
            warn "Ollama not found. Install from: https://ollama.ai"
        fi
        
        # Create Ollama adapter
        cat > lib/ai/smesh-llm-local.ts << 'EOF'
import OpenAI from 'openai';

// Initialize Ollama client (OpenAI compatible)
let ollamaClient: OpenAI | null = null;

function getOllamaClient(): OpenAI {
  if (!ollamaClient) {
    if (typeof window !== 'undefined') {
      throw new Error('Ollama client should not be initialized on the client side');
    }
    
    const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
    const model = process.env.OLLAMA_MODEL || 'llama3.1:70b';
    
    ollamaClient = new OpenAI({
      apiKey: 'ollama', // Ollama doesn't require API key
      baseURL: baseURL,
      timeout: 120000 // Longer timeout for local models
    });
    
    console.log(`🧠 LOCAL LLM: Initialized Ollama (${model}) for atmospheric intelligence`);
  }
  return ollamaClient;
}

export { getOllamaClient as getGeminiClient };
EOF
        
        # Update environment template
        cat >> .env.example << 'EOF'

# Ollama Local LLM Configuration
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1:70b
EOF
        
        success "Ollama local LLM migration template created"
        log "Don't forget to pull the model: ollama pull llama3.1:70b"
        ;;
        
    *)
        error "Unknown service type: $SERVICE_TYPE. Use: openai, claude, azure, or local"
        ;;
esac

# Create migration verification script
log "Creating verification script..."
cat > verify-migration.js << 'EOF'
// Migration Verification Script
const { spawn } = require('child_process');

async function verifyMigration() {
    console.log('🔍 Verifying SmeshLLM migration...');
    
    // Test 1: Build check
    console.log('Testing build...');
    const build = spawn('npm', ['run', 'build'], { stdio: 'pipe' });
    
    build.on('close', (code) => {
        if (code === 0) {
            console.log('✅ Build successful');
        } else {
            console.log('❌ Build failed');
        }
    });
    
    // Test 2: Basic API test
    setTimeout(async () => {
        try {
            const response = await fetch('http://localhost:3000/api/chat/chat-real', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Test migration',
                    location: { lat: 37.4275, lng: -122.1697 }
                })
            });
            
            if (response.ok) {
                console.log('✅ API endpoint accessible');
            } else {
                console.log('❌ API endpoint failed');
            }
        } catch (error) {
            console.log('❌ API test error:', error.message);
        }
    }, 5000);
}

if (require.main === module) {
    verifyMigration();
}
EOF

# Update package.json with verification script
log "Adding verification script to package.json..."
npx json -I -f package.json -e 'this.scripts["verify-migration"]="node verify-migration.js"'

# Create rollback script
log "Creating rollback script..."
cat > rollback-migration.sh << EOF
#!/bin/bash
# Rollback migration script
echo "🔄 Rolling back SmeshLLM migration..."

# Restore from backup
cp -r "$BACKUP_DIR/ai/" lib/
cp -r "$BACKUP_DIR/chat/" app/api/
cp "$BACKUP_DIR/package.json" .
cp "$BACKUP_DIR/.env.local" . 2>/dev/null || echo "No .env.local to restore"

# Reinstall dependencies
npm install

echo "✅ Rollback completed. Restart services manually."
EOF

chmod +x rollback-migration.sh

success "Migration preparation completed!"

log "Next steps:"
echo "1. Update environment variables in .env.local"
echo "2. Test the migration: npm run verify-migration"
echo "3. Start services: npm run dev (in separate terminal)"
echo "4. Start Python backend: cd python-services && source venv/bin/activate && python main.py"
echo "5. If issues occur, run: ./rollback-migration.sh"

log "Migration files created:"
echo "- lib/ai/smesh-llm-${SERVICE_TYPE}.ts"
echo "- verify-migration.js"  
echo "- rollback-migration.sh"
echo "- Backup: $BACKUP_DIR/"

warn "IMPORTANT: Manual integration required in lib/ai/smesh-llm.ts"
warn "Replace the getGeminiClient import and adapt function calling format"