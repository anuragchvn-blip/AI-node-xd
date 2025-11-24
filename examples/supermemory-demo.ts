/**
 * Supermemory Integration Demo
 * 
 * This demonstrates the Supermemory-style pattern matching system
 * built into VectorStoreService using pgvector + OpenAI embeddings
 */

import vectorStore from '../src/services/api/VectorStoreService';

async function demonstrateSupermemory() {
  console.log('=== Supermemory Integration Demo ===\n');

  // 1. CREATE SUPERMEMORY ENTRY
  console.log('1. Creating Supermemory Entry...');
  console.log('   This stores a failure pattern with vector embedding\n');

  const entryId = await vectorStore.createSupermemoryEntry({
    text: 'Frontend login button change broke backend authentication endpoint',
    metadata: {
      testRunId: '550e8400-e29b-41d4-a716-446655440000',
      commitHash: 'abc123def456',
      errorType: 'ConnectionError: ECONNREFUSED',
      affectedFiles: ['src/components/Login.tsx', 'src/api/auth.ts'],
      timestamp: new Date()
    }
  });

  console.log(`   ✓ Created entry ID: ${entryId}\n`);

  // 2. INSERT PATTERN (Alternative method)
  console.log('2. Inserting Pattern Directly...');
  console.log('   This is the core Supermemory insert operation\n');

  const patternId = await vectorStore.insertPattern({
    summary: 'API authentication failure after frontend login change',
    errorMessage: 'Connection refused on /api/auth',
    stackTrace: 'Error: connect ECONNREFUSED 127.0.0.1:8000\n    at TCPConnectWrap.afterConnect',
    affectedFiles: ['src/auth/login.ts', 'src/api/client.ts'],
    testName: 'test_auth_integration'
  });

  console.log(`   ✓ Created pattern ID: ${patternId}\n`);

  // 3. SEARCH SUPERMEMORY (Text-based search)
  console.log('3. Searching Supermemory by Text Query...');
  console.log('   Query: "authentication failure"\n');

  const searchResults = await vectorStore.searchSupermemory({
    query: 'authentication failure',
    topK: 5,
    threshold: 0.85
  });

  console.log(`   Found ${searchResults.length} similar patterns:\n`);
  searchResults.forEach((result, index) => {
    console.log(`   ${index + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}%`);
    console.log(`      Pattern: ${result.pattern.summary}`);
    console.log(`      Error: ${result.pattern.errorMessage}`);
    console.log(`      Occurred: ${result.pattern.occurrenceCount} time(s)\n`);
  });

  // 4. GENERATE EMBEDDING
  console.log('4. Generating Embedding...');
  console.log('   Text: "login error"\n');

  const embedding = await vectorStore.generateEmbedding('login error');
  console.log(`   ✓ Generated ${embedding.length}-dimensional vector`);
  console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]\n`);

  // 5. SEARCH BY EMBEDDING (Vector similarity search)
  console.log('5. Searching by Embedding Vector...');
  console.log('   Using cosine similarity with threshold 0.85\n');

  const vectorResults = await vectorStore.searchSimilarPatterns({
    embedding,
    topK: 3,
    threshold: 0.85
  });

  console.log(`   Found ${vectorResults.length} matches:\n`);
  vectorResults.forEach((result, index) => {
    console.log(`   ${index + 1}. ${(result.similarity * 100).toFixed(1)}% - ${result.pattern.summary}`);
  });

  console.log('\n=== Supermemory Demo Complete ===\n');
  console.log('Key Features:');
  console.log('✓ OpenAI embeddings (text-embedding-3-small, 1536 dimensions)');
  console.log('✓ pgvector for fast cosine similarity search');
  console.log('✓ Similarity threshold: 0.85 (85% match required)');
  console.log('✓ Automatic pattern occurrence tracking');
  console.log('✓ Metadata storage (files, tests, timestamps)');
}

// Export for use in other scripts
export { demonstrateSupermemory };

// Run if executed directly
if (require.main === module) {
  demonstrateSupermemory()
    .then(() => {
      console.log('\n✓ Demo completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Demo failed:', error.message);
      console.error('\nNote: This requires:');
      console.error('  - PostgreSQL with pgvector extension');
      console.error('  - OPENAI_API_KEY in .env');
      console.error('  - Database schema initialized');
      process.exit(1);
    });
}
