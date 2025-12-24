export default function HomePage() {
    return (
        <main style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            color: 'white'
        }}>
            <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎵 Beatly API</h1>
                <p style={{ color: '#888', marginBottom: '2rem' }}>Backend API Server</p>
                <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    backdropFilter: 'blur(10px)'
                }}>
                    <p style={{ marginBottom: '0.5rem' }}>✅ API is running</p>
                    <p style={{ color: '#888', fontSize: '0.9rem' }}>
                        Access API endpoints at <code style={{ background: '#333', padding: '2px 8px', borderRadius: '4px' }}>/api/*</code>
                    </p>
                </div>
            </div>
        </main>
    );
}
