import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

export async function POST(req) {
  try {
    const { history, message, context } = await req.json();
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const formattedHistory = history.map(item => ({
      role: item.role,
      parts: [{ text: item.parts }]
    }));

    // Ensure the first message is from the user and includes the system instruction
    const chatHistory = [];
    if (formattedHistory.length === 0 || formattedHistory[0].role !== 'user') {
      chatHistory.push({
        role: 'user',
        parts: [{ text: `System: Your responses should always be based on this knowledge base: ${context}. User: Hello` }]
      });
    } else {
      // Prepend the system instruction to the first user message
      chatHistory.push({
        role: 'user',
        parts: [{ text: `System: Your responses should always be based on this knowledge base: ${context}. User: ${formattedHistory[0].parts[0].text}` }]
      });
      formattedHistory.shift(); // Remove the first message as we've already added it
    }
    chatHistory.push(...formattedHistory);

    const chat = model.startChat({
      history: chatHistory
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Error in /api/gemini:', error);
    return NextResponse.json({ error: 'An error occurred while processing your request' }, { status: 500 });
  }
}