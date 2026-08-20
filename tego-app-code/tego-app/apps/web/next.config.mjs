/** @type {import('next').NextConfig} */
const nextConfig = {
  // pacotes do monorepo são TS puro, não pré-compilado — Next precisa transpilar
  transpilePackages: ["@tego/db", "@tego/metrics", "@tego/csv-import"],
};
export default nextConfig;
