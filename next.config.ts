import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Performance: Enable React strict mode
    reactStrictMode: true,

    // Performance: Enable compression
    compress: true,

    // Generate build ID for better caching
    generateBuildId: async () => {
        return `backend-build-${Date.now()}`;
    },

    // Headers for API security and CORS
    async headers() {
        return [
            // CORS headers for all API routes
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Credentials', value: 'true' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, PATCH' },
                    { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With, Accept, Origin' },
                    { key: 'Access-Control-Max-Age', value: '86400' },
                ],
            },
            // Security headers for all routes
            {
                source: '/:path*',
                headers: [
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    { key: 'X-XSS-Protection', value: '1; mode=block' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                ],
            },
        ];
    },
};

export default nextConfig;
