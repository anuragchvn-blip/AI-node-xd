import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

async function testGroqModels() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  console.log('\n🔍 Testing Groq with Updated Model\n');

  // Try the newer model
  const models = [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile', 
    'mixtral-8x7b-32768',
  ];

  for (const model of models) {
    try {
      console.log(`Testing ${model}...`);
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'Say hello in 5 words' }],
        model,
      });
      
      console.log(`✅ ${model} works!`);
      console.log(`   Response: ${completion.choices[0]?.message?.content}`);
      console.log(`   Tokens: ${completion.usage?.total_tokens}\n`);
      break;
    } catch (error: any) {
      console.log(`❌ ${model} failed: ${error.message}\n`);
    }
  }
}

testGroqModels();
