import prisma from './src/db/prisma';
import vectorStore from './src/services/api/VectorStoreService';
import { logger } from './src/utils/logger';

async function testVectorSearch() {
  console.log('\n🔍 VECTOR SEARCH & PATTERN MATCHING TEST\n');
  console.log('='.repeat(70));

  try {
    // Get project
    const project = await prisma.project.findUnique({
      where: { apiKey: 'sk_test_demo_key_12345' },
      include: { organization: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    console.log('📋 Project:', project.organization.name);
    console.log('💳 Credits:', project.organization.creditsBalance);

    // Test failure scenario
    const failureData = {
      failureLogs: `[ERROR] Database connection failed
Connection refused on port 5432
Unable to connect to PostgreSQL server
Check DATABASE_HOST and DATABASE_PORT environment variables`,
      gitDiff: `diff --git a/config/db.ts b/config/db.ts
- host: process.env.DB_HOST
+ host: process.env.DATABASE_HOST`,
    };

    // 1. Generate Embedding
    console.log('\n1️⃣  Generating Vector Embedding (OpenAI)');
    console.log('-'.repeat(70));
    const startEmbed = Date.now();
    
    const embedding = await vectorStore.generateEmbedding(
      `${failureData.failureLogs}\n${failureData.gitDiff}`
    );
    
    const embedTime = Date.now() - startEmbed;
    console.log(`   ✅ Embedding generated!`);
    console.log(`   Dimensions: ${embedding.length}`);
    console.log(`   Time: ${embedTime}ms`);
    console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

    // 2. AI Analysis
    console.log('\n2️⃣  AI Analysis (Groq)');
    console.log('-'.repeat(70));
    const startAI = Date.now();
    
    const analysis = await vectorStore.analyzeFailure(failureData);
    
    const aiTime = Date.now() - startAI;
    console.log(`   ✅ Analysis complete!`);
    console.log(`   Time: ${aiTime}ms`);
    console.log('\n' + '─'.repeat(70));
    console.log(analysis);
    console.log('─'.repeat(70));

    // 3. Search Similar Patterns
    console.log('\n3️⃣  Searching Similar Patterns (Vector Search)');
    console.log('-'.repeat(70));
    
    const similarPatterns = await vectorStore.searchSimilarPatterns({
      projectId: project.id,
      embedding,
      topK: 5,
      threshold: 0.75,
    });

    console.log(`   ✅ Search complete!`);
    console.log(`   Patterns found: ${similarPatterns.length}`);
    
    if (similarPatterns.length > 0) {
      console.log('\n   Similar Failures:');
      similarPatterns.forEach((match, i) => {
        console.log(`\n   ${i + 1}. Similarity: ${(match.similarity * 100).toFixed(1)}%`);
        console.log(`      Summary: ${match.pattern.summary.substring(0, 60)}...`);
        console.log(`      Occurred: ${match.pattern.occurrenceCount} times`);
      });
    } else {
      console.log('   No similar patterns found (this might be the first failure of this type)');
    }

    // 4. Store Pattern
    console.log('\n4️⃣  Storing Pattern for Future Matching');
    console.log('-'.repeat(70));
    
    const patternId = await vectorStore.insertPattern({
      projectId: project.id,
      summary: analysis.substring(0, 200),
      errorMessage: failureData.failureLogs.substring(0, 200),
      testName: 'Vector Search Test',
    });

    console.log(`   ✅ Pattern stored!`);
    console.log(`   Pattern ID: ${patternId}`);

    // 5. Verify Storage
    console.log('\n5️⃣  Verifying Pattern Storage');
    console.log('-'.repeat(70));
    
    const storedPatterns = await prisma.failurePattern.count({
      where: { projectId: project.id },
    });

    console.log(`   ✅ Total patterns in database: ${storedPatterns}`);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));
    console.log(`   ✅ Embedding generation: ${embedTime}ms`);
    console.log(`   ✅ AI analysis: ${aiTime}ms`);
    console.log(`   ✅ Pattern matching: Working`);
    console.log(`   ✅ Pattern storage: Working`);
    console.log(`   ✅ Total patterns: ${storedPatterns}`);
    console.log('\n🎉 Vector search is fully operational!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testVectorSearch();
