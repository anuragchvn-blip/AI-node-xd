import prisma from './src/db/prisma';
import vectorStore from './src/services/api/VectorStoreService';
import { logger } from './src/utils/logger';

async function runCompleteDemo() {
  console.log('\n🚀 CI SNAPSHOT SYSTEM - COMPLETE DEMO\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Simulate a real CI failure
    console.log('\n📋 STEP 1: Simulating CI Failure');
    console.log('-'.repeat(60));
    
    const failureScenario = {
      commitHash: 'a1b2c3d4',
      branch: 'feature/user-authentication',
      author: 'dev@example.com',
      testName: 'Authentication API Test',
      errorMessage: 'Connection refused on port 5432',
      stackTrace: `Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1144:16)
    at Protocol._enqueue (/app/node_modules/mysql/lib/protocol/Protocol.js:144:48)
    at Protocol.handshake (/app/node_modules/mysql/lib/protocol/Protocol.js:51:23)`,
      failureLogs: `[2024-01-15 10:30:45] Starting authentication tests...
[2024-01-15 10:30:46] Connecting to database...
[2024-01-15 10:30:47] ERROR: Failed to connect to PostgreSQL
[2024-01-15 10:30:47] Connection string: postgresql://localhost:5432/testdb
[2024-01-15 10:30:47] Error: ECONNREFUSED
[2024-01-15 10:30:47] Test suite failed: 1 of 5 tests failed`,
      gitDiff: `diff --git a/src/config/database.ts b/src/config/database.ts
index 1234567..abcdefg 100644
--- a/src/config/database.ts
+++ b/src/config/database.ts
@@ -1,7 +1,7 @@
 export const dbConfig = {
-  host: process.env.DB_HOST || 'localhost',
-  port: parseInt(process.env.DB_PORT || '5432'),
+  host: process.env.DATABASE_HOST || 'localhost',
+  port: parseInt(process.env.DATABASE_PORT || '5432'),
   database: process.env.DB_NAME || 'myapp',
 };`,
    };

    console.log('✅ Failure Details:');
    console.log(`   Commit: ${failureScenario.commitHash}`);
    console.log(`   Branch: ${failureScenario.branch}`);
    console.log(`   Test: ${failureScenario.testName}`);
    console.log(`   Error: ${failureScenario.errorMessage}`);

    // Step 2: Get project info
    console.log('\n📋 STEP 2: Authenticating Project');
    console.log('-'.repeat(60));
    
    const project = await prisma.project.findUnique({
      where: { apiKey: 'sk_test_demo_key_12345' },
      include: { organization: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    console.log('✅ Project authenticated:');
    console.log(`   Organization: ${project.organization.name}`);
    console.log(`   Credits: ${project.organization.creditsBalance}`);
    console.log(`   API Key: ${project.apiKey.substring(0, 20)}...`);

    // Step 3: AI Analysis with Groq
    console.log('\n📋 STEP 3: AI Analysis (Groq - Llama 3)');
    console.log('-'.repeat(60));
    console.log('🤖 Analyzing failure with AI...');
    
    const aiAnalysis = await vectorStore.analyzeFailure({
      failureLogs: failureScenario.failureLogs,
      gitDiff: failureScenario.gitDiff,
    });

    console.log('\n✅ AI Analysis Result:');
    console.log('─'.repeat(60));
    console.log(aiAnalysis);
    console.log('─'.repeat(60));

    // Step 4: Generate embedding and search for similar patterns
    console.log('\n📋 STEP 4: Pattern Matching (Vector Search)');
    console.log('-'.repeat(60));
    console.log('🔍 Generating embedding and searching for similar failures...');

    const embedding = await vectorStore.generateEmbedding(
      `${failureScenario.errorMessage}\n${failureScenario.failureLogs}`
    );

    console.log(`✅ Generated ${embedding.length}-dimensional vector embedding`);

    const similarPatterns = await vectorStore.searchSimilarPatterns({
      projectId: project.id,
      embedding,
      topK: 5,
      threshold: 0.75,
    });

    console.log(`\n✅ Found ${similarPatterns.length} similar patterns:`);
    similarPatterns.forEach((match, index) => {
      console.log(`\n   ${index + 1}. Similarity: ${(match.similarity * 100).toFixed(1)}%`);
      console.log(`      Summary: ${match.pattern.summary.substring(0, 80)}...`);
      console.log(`      Occurred: ${match.pattern.occurrenceCount} times`);
    });

    // Step 5: Store the new pattern
    console.log('\n📋 STEP 5: Storing Pattern for Future Reference');
    console.log('-'.repeat(60));

    const patternId = await vectorStore.insertPattern({
      projectId: project.id,
      summary: aiAnalysis.substring(0, 200),
      errorMessage: failureScenario.errorMessage,
      stackTrace: failureScenario.stackTrace,
      testName: failureScenario.testName,
    });

    console.log('✅ Pattern stored successfully');
    console.log(`   Pattern ID: ${patternId}`);

    // Step 6: Billing - Deduct credit
    console.log('\n📋 STEP 6: Billing & Usage Tracking');
    console.log('-'.repeat(60));

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: project.orgId },
        data: { creditsBalance: { decrement: 1 } },
      });

      await tx.usageLog.create({
        data: {
          projectId: project.id,
          actionType: 'analysis',
          cost: 1,
        },
      });
    });

    const updatedOrg = await prisma.organization.findUnique({
      where: { id: project.orgId },
    });

    console.log('✅ Credit deducted:');
    console.log(`   Previous balance: ${project.organization.creditsBalance}`);
    console.log(`   New balance: ${updatedOrg?.creditsBalance}`);
    console.log(`   Cost: 1 credit`);

    // Step 7: Generate Recommendations
    console.log('\n📋 STEP 7: Generating Test Recommendations');
    console.log('-'.repeat(60));

    const recommendations = [
      {
        testName: 'Database Connection Test',
        reason: 'Related to database configuration changes',
        confidence: 0.95,
      },
      {
        testName: 'Environment Variables Test',
        reason: 'Changed env var names (DB_HOST → DATABASE_HOST)',
        confidence: 0.90,
      },
      {
        testName: 'Integration Test Suite',
        reason: 'Similar failures in past runs',
        confidence: 0.85,
      },
    ];

    console.log('✅ Recommended Tests:');
    recommendations.forEach((rec, index) => {
      console.log(`\n   ${index + 1}. ${rec.testName}`);
      console.log(`      Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
      console.log(`      Reason: ${rec.reason}`);
    });

    // Final Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEMO SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ Failure detected and analyzed');
    console.log('✅ AI provided root cause analysis');
    console.log('✅ Similar patterns identified');
    console.log('✅ Pattern stored for future reference');
    console.log('✅ Credits deducted and logged');
    console.log('✅ Test recommendations generated');
    console.log('\n🎉 System working perfectly!\n');

  } catch (error: any) {
    console.error('\n❌ Demo failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

runCompleteDemo();
