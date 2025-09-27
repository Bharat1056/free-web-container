FROM node:22.16.0-alpine AS builder

RUN apk add --no-cache libc6-compat bash python3 make g++

WORKDIR /app

# Build arguments for environment variables
ARG GROQ_API_KEY
ARG GEMINI_API_KEY
ARG OPENAI_API_KEY
ARG E2B_API_KEY
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLERK_SECRET_KEY
ARG INNGEST_EVENT_KEY
ARG INNGEST_SIGNING_KEY
ARG DATABASE_URL

# Set environment variables from build arguments
ENV GROQ_API_KEY=$GROQ_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV E2B_API_KEY=$E2B_API_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV INNGEST_EVENT_KEY=$INNGEST_EVENT_KEY
ENV INNGEST_SIGNING_KEY=$INNGEST_SIGNING_KEY
ENV DATABASE_URL=$DATABASE_URL

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate

RUN npm run build


FROM node:22.16.0-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "run", "start"]
