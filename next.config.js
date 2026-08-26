/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["unpdf", "adm-zip"],
  },
};

module.exports = nextConfig;
