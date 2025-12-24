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
    // Headers for API security and CORS
    async headers() {
        return [
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
