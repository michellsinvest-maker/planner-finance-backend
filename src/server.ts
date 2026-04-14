import "dotenv/config.js"
import path from "node:path"
import Fastify from "fastify"
import cors from "@fastify/cors"
import fastifyStatic from "@fastify/static"
import { prisma } from "./db/prisma"
import { messageRoutes } from "./routes/message.routes"
import { registryRoutes } from "./routes/registry.routes"
import { debtRoutes } from "./routes/debt.routes"
import { dashboardRoutes } from "./routes/dashboard.routes"
import { whatsappService } from "./services/whatsapp.service"

const app = Fastify({
  logger: true,
})

async function bootstrap() {
  try {
    await app.register(cors, {
      origin: true,
    })

    await app.register(fastifyStatic, {
      root: path.resolve(process.cwd(), "public"),
      prefix: "/",
    })

    await app.register(messageRoutes, { prefix: "/api" })
    await app.register(registryRoutes, { prefix: "/api" })
    await app.register(debtRoutes, { prefix: "/api" })
    await app.register(dashboardRoutes, { prefix: "/api" })

    app.get("/", async (_request, reply) => {
      return reply.sendFile("launcher.html")
    })

    await prisma.$connect()

    const port = Number(process.env.PORT || 3333)
    const host = "0.0.0.0"

    await app.listen({ port, host })

    console.log(`API rodando em http://${host}:${port}`)

    try {
      await whatsappService.start()
      console.log("Serviço do WhatsApp inicializado.")
    } catch (error) {
      console.error("Falha ao iniciar serviço do WhatsApp:", error)
    }
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

process.on("SIGINT", async () => {
  try {
    await whatsappService.stop()
  } catch {
    // ignore
  }

  try {
    await prisma.$disconnect()
  } catch {
    // ignore
  }

  process.exit(0)
})

process.on("SIGTERM", async () => {
  try {
    await whatsappService.stop()
  } catch {
    // ignore
  }

  try {
    await prisma.$disconnect()
  } catch {
    // ignore
  }

  process.exit(0)
})

void bootstrap()