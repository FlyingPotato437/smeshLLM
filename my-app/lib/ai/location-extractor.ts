import { GoogleGenerativeAI } from '@google/generative-ai';
import { isLikelyLocationCandidate } from './location-heuristics';

// Initialize Gemini with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const LOCATION_MODEL_CANDIDATES = [
  process.env.GEMINI_LOCATION_MODEL,
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
].filter(Boolean) as string[];

const LOCATION_EXTRACTION_SYSTEM_PROMPT = `You are a precise location extraction assistant. 
Extract location information from natural language queries about wildfires, air quality, or environmental conditions.

RULES:
1. Extract the most specific location mentioned in the query
2. If no specific location is mentioned, return "null"
3. Always return a valid JSON object with the following structure:
   {
     "location": "The extracted location string or null",
     "context": "Brief context about the query"
   }

EXAMPLES:
Query: "wildfire risk in dublin california"
{"location": "Dublin, California", "context": "Wildfire risk assessment"}

Query: "What's the air quality like in San Francisco right now?"
{"location": "San Francisco, CA", "context": "Air quality inquiry"}

Query: "Show me active fires near me"
{"location": null, "context": "User's current location needed"}

Query: "How's the smoke in Portland, OR?"
{"location": "Portland, OR", "context": "Smoke conditions inquiry"}
`;

export async function extractLocationFromQuery(query: string): Promise<{location: string | null; context: string}> {
  let lastError: unknown = null;

  for (const modelName of LOCATION_MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: query }] },
          { 
            role: 'model', 
            parts: [{ 
              text: 'Please extract the location from this query and return a JSON object with the location and context.'
            }] 
          }
        ],
        systemInstruction: {
          role: 'system',
          parts: [{ text: LOCATION_EXTRACTION_SYSTEM_PROMPT }]
        },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 200,
        },
      });

      const response = await result.response;
      const text = response.text();
      
      // Extract JSON from the response
      try {
        // Using [\s\S] instead of /s flag for broader compatibility
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.location && !isLikelyLocationCandidate(query, parsed.location)) {
            return {
              location: null,
              context: 'No trustworthy location could be identified in the query'
            };
          }
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing location extraction response:', e);
      }

      return { location: null, context: 'Could not determine location' };
    } catch (error) {
      lastError = error;
      console.warn(`Location extraction failed with model "${modelName}", trying next model...`);
    }
  }

  if (lastError) {
    console.error('Error in extractLocationFromQuery:', lastError);
  }
  return { location: null, context: 'Error processing location' };
}

// Fallback function that uses simple heuristics// Enhanced fallback location extractor with better patterns
export function fallbackExtractLocation(query: string): { location: string | null; context: string } {
  const ignoredTokens = new Set([
    'is', 'are', 'what', 'where', 'when', 'how', 'the', 'this', 'that', 'there',
    'smoke', 'fire', 'wildfire', 'air', 'quality', 'pm', 'around', 'near',
  ]);

  // Enhanced regex patterns for location extraction
  const patterns = [
    // Patterns for city/region names
    {
      pattern: /(?:in|near|at|around|for|from|to|of|the\s+area\s+of)\s+([A-Z][a-zA-Z\s,]+?)(?:\?|$|\s+(?:what|where|when|why|how|is|are|was|were|will|can|could|should|the|a|an|my|your|our|their|his|her|its))/i,
      extract: (match: RegExpMatchArray) => match[1].trim()
    },
    {
      pattern: /(?:what'?s|show\s+me|check|find|get|see|display|look\s+up|search\s+for)\s+(?:the\s+)?(?:air\s+quality|smoke|fire|wildfire|pollution|aqi)(?:\s+in|\s+near|\s+at|\s+around|\s+for)?\s+([A-Z][a-zA-Z\s,]+?)(?:\?|$|\s+(?:right\s+now|today|tomorrow|yesterday|this\s+week|next\s+week))/i,
      extract: (match: RegExpMatchArray) => match[1].trim()
    },
    // Coordinate patterns - improved to catch more formats
    {
      pattern: /(?:coordinates?|coords?|at|near|around|from|to|of|the\s+area\s+of)?\s*([+-]?\d{1,3}\.\d+)\s*[°]?\s*[NS]?\s*[,/|\s]\s*([+-]?\d{1,3}\.\d+)\s*[°]?\s*[EW]?/i,
      extract: (match: RegExpMatchArray) => `COORDS:${match[1]},${match[2]}` // Special format for coordinate detection
    },
    // Alternative coordinate pattern for "lat lng" format
    {
      pattern: /(?:lat(?:itude)?\s*:?\s*)([+-]?\d{1,3}\.\d+)\s*,?\s*(?:lng|lon(?:gitude)?\s*:?\s*)([+-]?\d{1,3}\.\d+)/i,
      extract: (match: RegExpMatchArray) => `COORDS:${match[1]},${match[2]}`
    },
    // Common location patterns
    {
      pattern: /(?:in|near|at|around|for|from|to|of|the\s+area\s+of)\s+((?:[A-Z][a-zA-Z\s,]+?)(?:\s+(?:county|city|town|village|state|province|region|area|district|borough))?)(?:\?|$|\s+(?:what|where|when|why|how|is|are|was|were|will|can|could|should|the|a|an|my|your|our|their|his|her|its))/i,
      extract: (match: RegExpMatchArray) => match[1].trim()
    },
    // Last resort: look for capitalized words that might be place names
    {
      pattern: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b(?:\s+(?:county|city|town|village|state|province|region|area|district|borough))?/,
      extract: (match: RegExpMatchArray) => match[0].trim()
    }
  ];

  // Clean up the query first
  const cleanedQuery = query
    .replace(/[\n\r\t]+/g, ' ') // Replace newlines and tabs with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  // Try each pattern in order
  for (const { pattern, extract } of patterns) {
    const match = cleanedQuery.match(pattern);
    if (match) {
      try {
        const location = extract(match);
        const normalizedLocation = location?.trim().toLowerCase();
        if (
          location &&
          location.length > 2 &&
          !ignoredTokens.has(normalizedLocation) &&
          isLikelyLocationCandidate(cleanedQuery, location)
        ) {
          return {
            location,
            context: 'Location extracted using enhanced fallback method'
          };
        }
      } catch (e) {
        console.error('Error extracting location with pattern:', pattern, e);
      }
    }
  }

  // Location aliases and mappings
  const locationMappings: Record<string, string> = {
    'bay area': 'San Francisco Bay Area',
    'sf': 'San Francisco',
    'nyc': 'New York',
    'la': 'Los Angeles',
    'chi': 'Chicago',
    'sea': 'Seattle',
    'den': 'Denver',
    'miami': 'Miami',
    'stanford': 'Stanford, California',
    'me': 'your current location',
    'here': 'this location'
  };

  // Check for location aliases
  const lowerQuery = cleanedQuery.toLowerCase();
  for (const [alias, mappedLocation] of Object.entries(locationMappings)) {
    if (lowerQuery.includes(alias)) {
      return {
        location: mappedLocation,
        context: `Mapped location from alias '${alias}'`
      };
    }
  }

  // If no location found, try to extract any potential location-like phrases
  const potentialLocations = cleanedQuery.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const commonLocations = ['San Francisco', 'New York', 'Los Angeles', 'Chicago', 'Seattle', 'Denver', 'Miami'];
  
  for (const loc of potentialLocations) {
    if (commonLocations.includes(loc)) {
      return {
        location: loc,
        context: 'Common location extracted using fallback method'
      };
    }
  }

  return {
    location: null,
    context: 'No location could be identified in the query using fallback methods'
  };
}
