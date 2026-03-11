# ─── Nonna Pina — Docker Operations ───────────────────────────────────────────
# Usage:  make <target>
# Run `make help` for a list of all available commands.

COMPOSE := docker compose
APP     := app
DB      := postgres

.PHONY: help up down restart build logs logs-db \
        status ps shell db-shell \
        clean clean-images clean-volumes clean-all \
        migrate migrate-status studio \
        prod prod-restart prod-logs prod-stop

# ─── Help ──────────────────────────────────────────────────────────────────────

help: ## Show this help
	@echo ""
	@echo "  Nonna Pina — Docker commands"
	@echo "  ────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Lifecycle ─────────────────────────────────────────────────────────────────

up: ## Build and start all services (detached)
	$(COMPOSE) up --build -d

down: ## Stop and remove all containers
	$(COMPOSE) down

restart: down up ## Full restart (down + build + up)

build: ## Build images without starting
	$(COMPOSE) build

start: ## Start existing containers (no rebuild)
	$(COMPOSE) up -d

stop: ## Stop containers without removing them
	$(COMPOSE) stop

# ─── Logs & Status ─────────────────────────────────────────────────────────────

logs: ## Follow app logs
	$(COMPOSE) logs -f $(APP)

logs-db: ## Follow database logs
	$(COMPOSE) logs -f $(DB)

logs-all: ## Follow all service logs
	$(COMPOSE) logs -f

status: ## Show container status and health
	$(COMPOSE) ps -a

ps: status ## Alias for status

# ─── Shell Access ──────────────────────────────────────────────────────────────

shell: ## Open a shell inside the app container
	$(COMPOSE) exec $(APP) sh

db-shell: ## Open psql inside the database container
	$(COMPOSE) exec $(DB) psql -U npadmin -d nonnapina_staging

# ─── Cleanup ───────────────────────────────────────────────────────────────────

clean: ## Stop containers and remove orphans
	$(COMPOSE) down --remove-orphans

clean-images: ## Remove project images (forces rebuild on next up)
	$(COMPOSE) down --rmi local --remove-orphans

clean-volumes: ## ⚠️  Stop and remove containers AND volumes (DB data lost!)
	@echo "⚠️  This will DELETE database data and WhatsApp session!"
	@echo "    Press Ctrl+C to abort, or wait 5s..."
	@sleep 5
	$(COMPOSE) down -v --remove-orphans

clean-all: ## ⚠️  Full cleanup: containers, images, volumes, build cache
	@echo "⚠️  This will DELETE everything: images, volumes, DB data!"
	@echo "    Press Ctrl+C to abort, or wait 5s..."
	@sleep 5
	$(COMPOSE) down -v --rmi local --remove-orphans
	docker builder prune -f

# ─── Database / Prisma ─────────────────────────────────────────────────────────

migrate: ## Run pending Prisma migrations inside the app container
	$(COMPOSE) exec $(APP) npx prisma migrate deploy

migrate-status: ## Show migration status
	$(COMPOSE) exec $(APP) npx prisma migrate status

# ─── Production (VPS) ─────────────────────────────────────────────────────────
# These targets use docker-compose.prod.yml with .env.production secrets.

PROD_COMPOSE := $(COMPOSE) -f docker-compose.prod.yml --env-file .env.production

prod: ## 🚀 Production deploy: pull + start with .env.production
	$(PROD_COMPOSE) up -d

prod-restart: ## 🔄 Production restart
	$(PROD_COMPOSE) down
	$(PROD_COMPOSE) up -d

prod-logs: ## 📋 Follow production app logs
	$(PROD_COMPOSE) logs -f $(APP)

prod-stop: ## ⏹  Stop production containers
	$(PROD_COMPOSE) down

prod-status: ## 📊 Show production container status
	$(PROD_COMPOSE) ps -a

prod-db-shell: ## Open psql inside the production database
	$(PROD_COMPOSE) exec $(DB) psql -U npadmin -d nonnapina_prod

# ─── Quick combos ─────────────────────────────────────────────────────────────

fresh: clean-images up ## Fresh build from scratch (keeps data)

nuke: clean-all up ## ⚠️  Nuclear option: wipe everything and rebuild
