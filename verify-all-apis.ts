import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';
import prisma from './src/db/prisma';
import dotenv from 'dotenv';

dotenv.config();

async function verifyAllAPIs() {
  console.log('\n🔍 COMPREHENSIVE API VERIFICATION TEST\n');
  console.log('='.repeat(70));
  console.log('This test will verify ALL APIs are working with REAL keys\n');

  const results = {
    groq: false,
    supabase: false,
    razorpay: false,
    database: false,
  };

  // 1. GROQ API TEST
  console.log('1️⃣  TESTING GROQ API');
  console.log('-'.repeat(70));
  try {
    const groqKey = process.env.GROQ_API_KEY;
    console.log(`   Key: ${groqKey?.substring(0, 15)}...${groqKey?.substring(groqKey.length - 5)}`);
    
    const groq = new Groq({ apiKey: groqKey });
    const startTime = Date.now();
    
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Say "API works" in 3 words' }],
      model: 'llama-3.3-70b-versatile',
    });
    
    const duration = Date.now() - startTime;
    const response = completion.choices[0]?.message?.content;
    
    console.log(`   ✅ SUCCESS!`);
    console.log(`   Response: "${response}"`);
    console.log(`   Time: ${duration}ms`);
    console.log(`   Tokens: ${completion.usage?.total_tokens}`);
    console.log(`   Request ID: ${completion.id}`);
    results.groq = true;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
  }

  // 2. SUPABASE API TEST
  console.log('\n2️⃣  TESTING SUPABASE API');
  console.log('-'.repeat(70));
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    console.log(`   URL: ${supabaseUrl}`);
    console.log(`   Key: ${supabaseKey?.substring(0, 20)}...`);
    
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    
    // Test database query
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    
    console.log(`   ✅ SUCCESS!`);
    console.log(`   Connected to Supabase`);
    console.log(`   Organizations found: ${data?.length || 0}`);
    results.supabase = true;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
  }

  // 3. RAZORPAY API TEST
  console.log('\n3️⃣  TESTING RAZORPAY API');
  console.log('-'.repeat(70));
  try {
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
    console.log(`   Key ID: ${razorpayKeyId}`);
    console.log(`   Secret: ${razorpaySecret?.substring(0, 10)}...`);
    
    const razorpay = new Razorpay({
      key_id: razorpayKeyId!,
      key_secret: razorpaySecret!,
    });
    
    // Create a test order
    const order = await razorpay.orders.create({
      amount: 100, // 1 INR in paise
      currency: 'INR',
      receipt: `test_${Date.now()}`,
    });
    
    console.log(`   ✅ SUCCESS!`);
    console.log(`   Order created: ${order.id}`);
    console.log(`   Amount: ₹${(order.amount as number) / 100}`);
    console.log(`   Status: ${order.status}`);
    results.razorpay = true;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
  }

  // 4. DATABASE (PRISMA) TEST
  console.log('\n4️⃣  TESTING DATABASE (PRISMA)');
  console.log('-'.repeat(70));
  try {
    const dbUrl = process.env.DATABASE_URL;
    console.log(`   URL: ${dbUrl?.substring(0, 40)}...`);
    
    await prisma.$connect();
    
    const orgCount = await prisma.organization.count();
    const projectCount = await prisma.project.count();
    
    console.log(`   ✅ SUCCESS!`);
    console.log(`   Organizations: ${orgCount}`);
    console.log(`   Projects: ${projectCount}`);
    results.database = true;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }

  // FINAL SUMMARY
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  
  const allPassed = Object.values(results).every(r => r === true);
  
  console.log(`\n   Groq API:      ${results.groq ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`   Supabase:      ${results.supabase ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`   Razorpay:      ${results.razorpay ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`   Database:      ${results.database ? '✅ WORKING' : '❌ FAILED'}`);
  
  if (allPassed) {
    console.log('\n🎉 ALL APIS ARE WORKING WITH REAL KEYS!');
    console.log('   No mocks, no placeholders - everything is production-ready!\n');
  } else {
    console.log('\n⚠️  SOME APIS FAILED - Check the errors above\n');
  }

  console.log('Check your dashboards:');
  console.log('   • Groq: https://console.groq.com/usage');
  console.log('   • Supabase: https://supabase.com/dashboard');
  console.log('   • Razorpay: https://dashboard.razorpay.com/app/orders\n');
}

verifyAllAPIs();
