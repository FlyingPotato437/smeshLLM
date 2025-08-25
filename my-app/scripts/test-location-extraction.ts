import { extractLocationFromQuery, fallbackExtractLocation } from '../lib/ai/location-extractor';

async function testLocationExtraction(query: string) {
  console.log('\n=== Testing Location Extraction ===');
  console.log(`Query: "${query}"`);
  
  try {
    // Test AI extraction
    console.log('\n🤖 Testing AI extraction...');
    const aiResult = await extractLocationFromQuery(query);
    console.log('AI Extraction Result:', {
      success: !!aiResult.location,
      location: aiResult.location || 'None',
      context: aiResult.context
    });
    
    // Test fallback extraction
    console.log('\n🔍 Testing fallback extraction...');
    const fallbackResult = fallbackExtractLocation(query);
    console.log('Fallback Extraction Result:', {
      success: !!fallbackResult.location,
      location: fallbackResult.location || 'None',
      context: fallbackResult.context
    });
    
  } catch (error) {
    console.error('❌ Error during location extraction test:', error);
  }
}

// Run tests
(async () => {
  // Test cases
  const testQueries = [
    "What's the air quality like in San Francisco?",
    "Show me wildfire smoke near 37.7749° N, 122.4194° W",
    "Is there any smoke in the Bay Area?",
    "How's the air quality in New York?",
    "Check smoke levels near me"
  ];
  
  for (const query of testQueries) {
    await testLocationExtraction(query);
    console.log('\n' + '-'.repeat(50) + '\n');
  }
  
  console.log('✅ Location extraction tests completed!');
})();
