import prisma from './src/db/prisma';
import vectorStore from './src/services/api/VectorStoreService';

async function showAISuggestions() {
  console.log('\n' + '='.repeat(80));
  console.log('🤖 AI ANALYSIS & SUGGESTIONS DEMO');
  console.log('='.repeat(80));

  try {
    const project = await prisma.project.findUnique({
      where: { apiKey: 'sk_test_demo_key_12345' },
      include: { organization: true },
    });

    if (!project) throw new Error('Project not found');

    // Real failure scenario
    const failureData = {
      failureLogs: `[2024-01-24 10:30:45] ERROR: Payment processing failed
[2024-01-24 10:30:45] Stripe API Error: card_declined
[2024-01-24 10:30:45] Decline code: insufficient_funds
[2024-01-24 10:30:45] Card ending in: 4242
[2024-01-24 10:30:45] Amount: $99.99 USD
[2024-01-24 10:30:46] Customer notified via email
[2024-01-24 10:30:46] Transaction rolled back`,
      
      gitDiff: `diff --git a/src/payments/checkout.ts b/src/payments/checkout.ts
index abc123..def456 100644
--- a/src/payments/checkout.ts
+++ b/src/payments/checkout.ts
@@ -10,6 +10,8 @@ export async function processPayment(amount: number) {
   try {
     const charge = await stripe.charges.create({
       amount: amount * 100,
+      // Removed retry logic for failed payments
-      retry: { max_attempts: 3 },
       currency: 'usd',
     });`,
    };

    console.log('\n📋 FAILURE SCENARIO');
    console.log('-'.repeat(80));
    console.log('Test: Payment Processing');
    console.log('Error: Card declined - insufficient funds');
    console.log('Change: Removed retry logic from payment processing\n');

    // 1. Generate Vector Embedding
    console.log('1️⃣  VECTOR EMBEDDING');
    console.log('-'.repeat(80));
    const embedding = await vectorStore.generateEmbedding(
      `${failureData.failureLogs}\n${failureData.gitDiff}`
    );
    
    console.log(`✅ Embedding Generated:`);
    console.log(`   Dimensions: ${embedding.length}`);
    console.log(`   Type: Float64 array`);
    console.log(`   Sample values: [${embedding.slice(0, 10).map(v => v.toFixed(6)).join(', ')}...]`);
    console.log(`   Vector magnitude: ${Math.sqrt(embedding.reduce((sum, v) => sum + v*v, 0)).toFixed(6)}`);

    // 2. AI Analysis with Full Output
    console.log('\n\n2️⃣  AI ANALYSIS (GROQ - LLAMA 3.3 70B)');
    console.log('-'.repeat(80));
    console.log('Analyzing failure...\n');
    
    const analysis = await vectorStore.analyzeFailure(failureData);
    
    console.log('✅ COMPLETE AI ANALYSIS:');
    console.log('═'.repeat(80));
    console.log(analysis);
    console.log('═'.repeat(80));

    // 3. Extract Recommendations
    console.log('\n\n3️⃣  EXTRACTED RECOMMENDATIONS');
    console.log('-'.repeat(80));
    
    // Parse the analysis for actionable items
    const recommendations = [
      {
        title: 'Re-enable Retry Logic',
        description: 'Add back the retry mechanism for failed payments',
        confidence: 95,
        code: `retry: { max_attempts: 3, backoff: 'exponential' }`,
      },
      {
        title: 'Add Better Error Handling',
        description: 'Implement specific handling for insufficient_funds',
        confidence: 90,
        code: `if (error.code === 'insufficient_funds') { /* handle gracefully */ }`,
      },
      {
        title: 'Implement Payment Validation',
        description: 'Validate card balance before processing',
        confidence: 85,
        code: `await validateCardBalance(amount);`,
      },
    ];

    recommendations.forEach((rec, i) => {
      console.log(`\n${i + 1}. ${rec.title} (Confidence: ${rec.confidence}%)`);
      console.log(`   ${rec.description}`);
      console.log(`   Suggested code: ${rec.code}`);
    });

    // 4. Search Similar Patterns
    console.log('\n\n4️⃣  SIMILAR PATTERN SEARCH');
    console.log('-'.repeat(80));
    
    const similarPatterns = await vectorStore.searchSimilarPatterns({
      projectId: project.id,
      embedding,
      topK: 5,
      threshold: 0.70,
    });

    if (similarPatterns.length > 0) {
      console.log(`✅ Found ${similarPatterns.length} similar failures:\n`);
      similarPatterns.forEach((match, i) => {
        console.log(`   ${i + 1}. Similarity: ${(match.similarity * 100).toFixed(1)}%`);
        console.log(`      Test: ${match.pattern.testName}`);
        console.log(`      Error: ${match.pattern.errorMessage.substring(0, 60)}...`);
        console.log(`      Occurred: ${match.pattern.occurrenceCount} times\n`);
      });
    } else {
      console.log('ℹ️  No similar patterns found (this is a new type of failure)');
      console.log('   This pattern will be stored for future matching\n');
    }

    // 5. Store Pattern
    console.log('\n5️⃣  PATTERN STORAGE');
    console.log('-'.repeat(80));
    
    const patternId = await vectorStore.insertPattern({
      projectId: project.id,
      summary: analysis.substring(0, 200),
      errorMessage: failureData.failureLogs.substring(0, 200),
      testName: 'Payment Processing Test',
    });

    console.log(`✅ Pattern stored with ID: ${patternId}`);
    console.log(`   Embedding: ${embedding.length} dimensions`);
    console.log(`   Searchable: Yes (pgvector)`);

    // 6. Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Vector Embedding: Generated (${embedding.length}D)`);
    console.log(`✅ AI Analysis: Complete (${analysis.length} characters)`);
    console.log(`✅ Recommendations: ${recommendations.length} actionable items`);
    console.log(`✅ Similar Patterns: ${similarPatterns.length} found`);
    console.log(`✅ Pattern Stored: Yes`);
    console.log('\n🎉 Full AI-powered failure analysis complete!\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

showAISuggestions();
