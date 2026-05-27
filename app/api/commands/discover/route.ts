import { NextResponse } from 'next/server';
import { discoverAllCommands } from '@/lib/command-discovery';
import { homedir } from 'os';

export async function GET() {
  try {
    const homeDir = homedir();
    const categories = await discoverAllCommands(homeDir);
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Command discovery failed:', error);
    return NextResponse.json({ categories: [] });
  }
}
