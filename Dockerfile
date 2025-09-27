FROM node:22.16.0-alpine AS builder

RUN apk add --no-cache libc6-compat bash python3 make g++

WORKDIR /app


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
RUN npm ci --omit=dev

COPY --from=builder /app ./

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "run", "start"]
