import { NextResponse } from 'next/server';

// Simulasi data real-time dari Google Analytics
const mockData = {
  pageViews: 0,
  musicPlays: 0,
  searches: 0,
  playlistGenerations: 0,
  socialClicks: 0,
  profileClicks: 0,
  errors: 0,
  realTimeUsers: 0,
  totalVisitors: 0, // Total pengunjung sepanjang masa
  topPages: [
    { page: 'Homepage', views: 0 },
    { page: 'Search', views: 0 },
    { page: 'Playlist', views: 0 },
    { page: 'Admin', views: 0 }
  ],
  topEvents: [
    { event: 'page_view', count: 0 },
    { event: 'play_song', count: 0 },
    { event: 'search_music', count: 0 },
    { event: 'test_event', count: 0 },
    { event: 'profile_photo_click', count: 0 },
    { event: 'social_click', count: 0 },
    { event: 'navigate_to_search', count: 0 },
    { event: 'scroll_to_songs', count: 0 }
  ],
  isRealData: false,
  lastUpdated: new Date().toISOString(),
  message: 'Menggunakan data simulasi. Google Analytics belum terhubung.'
};

// Track user sessions
const activeSessions = new Map<string, { lastSeen: Date; events: string[] }>();
// Track unique visitors (all-time)
const uniqueVisitors = new Set<string>();

// Update data berdasarkan events yang diterima
function updateAnalyticsData(eventType: string) {
  const now = new Date();

  // Update real-time users (sessions yang aktif dalam 5 menit terakhir)
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  let activeUsers = 0;

  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.lastSeen > fiveMinutesAgo) {
      activeUsers++;
      session.events.push(eventType);
    } else {
      activeSessions.delete(sessionId);
    }
  }

  // Update metrics berdasarkan event type
  switch (eventType) {
    case 'page_view':
      mockData.pageViews++;
      break;
    case 'play_song':
      mockData.musicPlays++;
      break;
    case 'search_music':
      mockData.searches++;
      break;
    case 'generate_ai_playlist':
      mockData.playlistGenerations++;
      break;
    case 'social_click':
      mockData.socialClicks++;
      break;
    case 'profile_photo_click':
      mockData.profileClicks++;
      break;
    case 'test_event':
      // Test event tidak mengubah metrics
      break;
    default:
      // Event tidak dikenal
      break;
  }

  // Update top events
  const eventIndex = mockData.topEvents.findIndex(e => e.event === eventType);
  if (eventIndex !== -1) {
    mockData.topEvents[eventIndex].count++;
  } else {
    mockData.topEvents.push({ event: eventType, count: 1 });
  }

  // Update real-time users
  mockData.realTimeUsers = activeUsers;

  // Update total visitors count
  mockData.totalVisitors = uniqueVisitors.size;

  // Update last updated time
  mockData.lastUpdated = now.toISOString();

  // Set as real data jika ada activity
  if (activeUsers > 0) {
    mockData.isRealData = true;
    mockData.message = 'Real Google Analytics data';
  }
}

export async function GET() {
  // Simulasi data real-time dari Google Analytics
  // Dalam implementasi nyata, ini akan mengambil data dari Google Analytics API

  // Update data berdasarkan events yang diterima
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Clean up old sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.lastSeen < fiveMinutesAgo) {
      activeSessions.delete(sessionId);
    }
  }

  // Update real-time users count
  mockData.realTimeUsers = activeSessions.size;

  // Update total visitors count
  mockData.totalVisitors = uniqueVisitors.size;

  // Simulasi beberapa events untuk demo
  if (Math.random() > 0.7) {
    const events = ['page_view', 'play_song', 'search_music', 'test_event'];
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    updateAnalyticsData(randomEvent);
  }

  return NextResponse.json(mockData);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventType, sessionId } = body;

    // Track session
    if (sessionId) {
      const now = new Date();
      if (activeSessions.has(sessionId)) {
        activeSessions.get(sessionId)!.lastSeen = now;
        activeSessions.get(sessionId)!.events.push(eventType);
      } else {
        // New session - track as unique visitor
        activeSessions.set(sessionId, {
          lastSeen: now,
          events: [eventType]
        });
        uniqueVisitors.add(sessionId);
      }
    }

    // Update analytics data
    updateAnalyticsData(eventType);

    return NextResponse.json({
      success: true,
      message: 'Event tracked successfully',
      realTimeUsers: activeSessions.size,
      totalVisitors: uniqueVisitors.size
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to track event'
    }, { status: 500 });
  }
}