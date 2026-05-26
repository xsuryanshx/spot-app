FROM node:20-alpine

WORKDIR /app

COPY apps/agent/package.json apps/agent/package-lock.json ./apps/agent/
RUN cd apps/agent && npm ci

COPY apps/agent ./apps/agent
COPY pipelines ./pipelines

WORKDIR /app/apps/agent

ENV NODE_ENV=production
ENV SPOT_PIPELINE_PATH=../../pipelines/spot.pipe
ENV SPOT_STATE_PATH=/data/.spot-state.json

EXPOSE 8080

CMD ["npm", "start"]
