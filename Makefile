# Makefile for Facebook Ads Archive Crawler
# Provides convenient commands for development and testing

# Variables
DOCKER_IMAGE_NAME = facebook-ads-archive-crawler
DOCKER_TAG = latest
INPUT_FILE = storage/key_value_stores/default/INPUT.json
TEMP_INPUT_FILE = /tmp/apify_input_$(shell date +%s).json

# Colors for output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

.PHONY: help
help: ## Show this help message
	@echo "$(GREEN)Facebook Ads Archive Crawler - Available commands:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

.PHONY: install
install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm install
	@echo "$(GREEN)Dependencies installed successfully!$(NC)"

.PHONY: run
run: ## Run the actor locally (without Docker)
	@echo "$(GREEN)Running actor locally...$(NC)"
	npm start

.PHONY: run_locally
run_locally: ## Run the actor in Docker with temporary input file
	@echo "$(GREEN)Creating temporary input file...$(NC)"
	@if [ ! -f "$(INPUT_FILE)" ]; then \
		echo "$(RED)Error: $(INPUT_FILE) not found!$(NC)"; \
		echo "$(YELLOW)Creating default input file...$(NC)"; \
		mkdir -p storage/key_value_stores/default; \
		echo '{"startUrls":["https://www.facebook.com/ads/archive/render_ad/?id=2500687420313026&access_token=EAALQdhYSGfcBPZCRsiTKpNPGUZB7F73wee2Kx11CmeFszEcXLoFLMP1S4czDTU6h2ZABaPdSWCZCOTZB7FGAJwHqodFvrtwTBAi4lEHjXDUEC6VZBziC6mqS2oKFuEaLzmX95wycC4GmSz8irsTeipUnuraH4pUVOajB5yIjMb4jpPHrsiwJlYCLYlsgZDZD"]}' > $(INPUT_FILE); \
	fi
	@cp $(INPUT_FILE) $(TEMP_INPUT_FILE)
	@echo "$(GREEN)Input file copied to $(TEMP_INPUT_FILE)$(NC)"
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE_NAME):$(DOCKER_TAG) .
	@echo "$(GREEN)Running Docker container...$(NC)"
	docker run --rm \
		-v $(TEMP_INPUT_FILE):/app/storage/key_value_stores/default/INPUT.json:ro \
		-v $(PWD)/storage/datasets:/app/storage/datasets \
		-e APIFY_LOCAL_STORAGE_DIR=/app/storage \
		$(DOCKER_IMAGE_NAME):$(DOCKER_TAG)
	@echo "$(GREEN)Container finished. Cleaning up temporary input file...$(NC)"
	@rm -f $(TEMP_INPUT_FILE)
	@echo "$(GREEN)Done! Check storage/datasets/default for results.$(NC)"

.PHONY: build
build: ## Build Docker image
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE_NAME):$(DOCKER_TAG) .
	@echo "$(GREEN)Image built successfully: $(DOCKER_IMAGE_NAME):$(DOCKER_TAG)$(NC)"

.PHONY: run_docker
run_docker: ## Run the actor in Docker (uses existing INPUT.json)
	@echo "$(GREEN)Running actor in Docker...$(NC)"
	@if [ ! -f "$(INPUT_FILE)" ]; then \
		echo "$(RED)Error: $(INPUT_FILE) not found!$(NC)"; \
		echo "$(YELLOW)Please create the input file first or use 'make run_locally'$(NC)"; \
		exit 1; \
	fi
	docker run --rm \
		-v $(PWD)/storage:/app/storage \
		-e APIFY_LOCAL_STORAGE_DIR=/app/storage \
		$(DOCKER_IMAGE_NAME):$(DOCKER_TAG)
	@echo "$(GREEN)Done! Check storage/datasets/default for results.$(NC)"

.PHONY: create_input
create_input: ## Create a sample INPUT.json file
	@echo "$(GREEN)Creating sample input file...$(NC)"
	@mkdir -p storage/key_value_stores/default
	@echo '{\n  "startUrls": [\n    "https://www.facebook.com/ads/archive/render_ad/?id=2500687420313026&access_token=EAALQdhYSGfcBPZCRsiTKpNPGUZB7F73wee2Kx11CmeFszEcXLoFLMP1S4czDTU6h2ZABaPdSWCZCOTZB7FGAJwHqodFvrtwTBAi4lEHjXDUEC6VZBziC6mqS2oKFuEaLzmX95wycC4GmSz8irsTeipUnuraH4pUVOajB5yIjMb4jpPHrsiwJlYCLYlsgZDZD",\n    "https://www.facebook.com/ads/archive/render_ad/?id=1337761321325468&access_token=EAALQdhYSGfcBPZCRsiTKpNPGUZB7F73wee2Kx11CmeFszEcXLoFLMP1S4czDTU6h2ZABaPdSWCZCOTZB7FGAJwHqodFvrtwTBAi4lEHjXDUEC6VZBziC6mqS2oKFuEaLzmX95wycC4GmSz8irsTeipUnuraH4pUVOajB5yIjMb4jpPHrsiwJlYCLYlsgZDZD",\n    "https://www.facebook.com/ads/archive/render_ad/?id=1492543415282235&access_token=EAALQdhYSGfcBPZCRsiTKpNPGUZB7F73wee2Kx11CmeFszEcXLoFLMP1S4czDTU6h2ZABaPdSWCZCOTZB7FGAJwHqodFvrtwTBAi4lEHjXDUEC6VZBziC6mqS2oKFuEaLzmX95wycC4GmSz8irsTeipUnuraH4pUVOajB5yIjMb4jpPHrsiwJlYCLYlsgZDZD"\n  ],\n  "maxConcurrency": 5,\n  "requestTimeout": 30000\n}' > $(INPUT_FILE)
	@echo "$(GREEN)Sample input file created: $(INPUT_FILE)$(NC)"
	@echo "$(YELLOW)Edit this file to add your own URLs$(NC)"

.PHONY: view_results
view_results: ## View the latest results from Dataset
	@echo "$(GREEN)Latest crawl results:$(NC)"
	@if [ -d "storage/datasets/default" ] && [ -n "$$(ls -A storage/datasets/default 2>/dev/null)" ]; then \
		cat storage/datasets/default/*.json 2>/dev/null | jq -r '.[] | "Ad ID: \(.ad_id // "N/A") | Advertiser: \(.advertiser_name // "N/A") | Type: \(.ad_type // "N/A") | CTA: \(.cta_url // "N/A")"' 2>/dev/null || cat storage/datasets/default/*.json; \
	else \
		echo "$(YELLOW)No results found. Run the crawler first!$(NC)"; \
	fi

.PHONY: clean
clean: ## Clean storage and temporary files
	@echo "$(YELLOW)Cleaning storage and temporary files...$(NC)"
	rm -rf storage/datasets/default/*
	rm -rf storage/request_queues/default/*
	rm -rf storage/key_value_stores/default/SDK_CRAWLER_STATISTICS*
	@echo "$(GREEN)Cleaned successfully!$(NC)"

.PHONY: clean_all
clean_all: clean ## Clean all storage including input
	@echo "$(YELLOW)Removing all storage files...$(NC)"
	rm -rf storage/*
	@echo "$(GREEN)All storage cleaned!$(NC)"

.PHONY: lint
lint: ## Run linter
	@echo "$(GREEN)Running linter...$(NC)"
	npm run lint

.PHONY: lint_fix
lint_fix: ## Fix linting issues
	@echo "$(GREEN)Fixing linting issues...$(NC)"
	npm run lint:fix

.PHONY: format
format: ## Format code with Prettier
	@echo "$(GREEN)Formatting code...$(NC)"
	npm run format

.PHONY: format_check
format_check: ## Check code formatting
	@echo "$(GREEN)Checking code formatting...$(NC)"
	npm run format:check

.PHONY: logs
logs: ## Show Docker container logs
	@echo "$(GREEN)Showing Docker logs...$(NC)"
	docker logs $$(docker ps -a -q --filter ancestor=$(DOCKER_IMAGE_NAME):$(DOCKER_TAG) | head -1)

.PHONY: shell
shell: ## Open a shell in the Docker container
	@echo "$(GREEN)Opening shell in Docker container...$(NC)"
	docker run --rm -it \
		-v $(PWD):/app \
		--entrypoint /bin/sh \
		$(DOCKER_IMAGE_NAME):$(DOCKER_TAG)

.PHONY: test
test: ## Run tests
	@echo "$(GREEN)Running tests...$(NC)"
	npm test

.PHONY: push
push: ## Push actor to Apify platform
	@echo "$(GREEN)Pushing actor to Apify platform...$(NC)"
	apify push

.PHONY: deploy
deploy: build push ## Build and deploy to Apify platform
	@echo "$(GREEN)Deployed successfully!$(NC)"

.PHONY: watch
watch: ## Watch for changes and rebuild
	@echo "$(GREEN)Watching for changes...$(NC)"
	@while true; do \
		inotifywait -r -e modify,create,delete src/ 2>/dev/null || \
		fswatch -o src/ | while read; do \
			clear; \
			echo "$(YELLOW)Changes detected, rebuilding...$(NC)"; \
			make build; \
			echo "$(GREEN)Rebuild complete!$(NC)"; \
		done; \
	done

# Default target
.DEFAULT_GOAL := help
