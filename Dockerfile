FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG RAILWAY_GIT_COMMIT_SHA
ARG SOURCE_COMMIT
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/src/content ./src/content
COPY --from=build /app/src/core/grid.ts ./src/core/grid.ts
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
