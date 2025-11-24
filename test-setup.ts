import prisma from './src/db/prisma';
import { logger } from './src/utils/logger';

async function testSetup() {
  try {
    logger.info('Starting system verification...');

    // Test 1: Database Connection
    logger.info('Test 1: Checking database connection...');
    await prisma.$connect();
    logger.info('✅ Database connected successfully');

    // Test 2: Create Test Organization
    logger.info('Test 2: Creating test organization...');
    const org = await prisma.organization.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Organization',
        creditsBalance: 100,
      },
    });
    logger.info('✅ Organization created/found', { orgId: org.id, credits: org.creditsBalance });

    // Test 3: Create Test Project
    logger.info('Test 3: Creating test project...');
    const project = await prisma.project.upsert({
      where: { apiKey: 'sk_test_demo_key_12345' },
      update: {},
      create: {
        orgId: org.id,
        apiKey: 'sk_test_demo_key_12345',
        repoUrl: 'https://github.com/test/repo',
      },
    });
    logger.info('✅ Project created/found', { projectId: project.id, apiKey: project.apiKey });

    // Test 4: Check Credits
    logger.info('Test 4: Verifying credit balance...');
    const orgWithCredits = await prisma.organization.findUnique({
      where: { id: org.id },
      select: { creditsBalance: true },
    });
    logger.info('✅ Credits verified', { balance: orgWithCredits?.creditsBalance });

    // Test 5: Create Usage Log
    logger.info('Test 5: Creating test usage log...');
    const usageLog = await prisma.usageLog.create({
      data: {
        projectId: project.id,
        actionType: 'test',
        cost: 0,
      },
    });
    logger.info('✅ Usage log created', { logId: usageLog.id });

    logger.info('🎉 All tests passed! System is ready.');
    logger.info('');
    logger.info('📝 Test API Key: sk_test_demo_key_12345');
    logger.info('🔑 Use this key to test the API endpoints');

  } catch (error: any) {
    logger.error('❌ Test failed', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testSetup();
