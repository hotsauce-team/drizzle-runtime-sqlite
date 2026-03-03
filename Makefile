.PHONY: clone-repos clean-repos test test-node22 test-node24 test-deno build lint fmt check

# Clone Drizzle ORM repo for shared test suite
clone-repos:
	@mkdir -p repos
	@if [ ! -d repos/drizzle-orm ]; then \
		git clone --depth 1 https://github.com/drizzle-team/drizzle-orm.git repos/drizzle-orm; \
	else \
		echo "repos/drizzle-orm already exists"; \
	fi

# Remove cloned repositories
clean-repos:
	rm -rf repos/

# Run all tests in Docker
test: test-deno-2.7

# Run Node + Vitest tests (Drizzle shared suite)
test-node22:
	docker compose run --rm test-node22

test-node24:
	docker compose run --rm test-node24

# Run Deno + Vitest tests (Drizzle shared suite)
test-deno-2.6:
	docker compose run --rm test-deno-2.6

test-deno-2.7:
	docker compose run --rm test-deno-2.7

# Build Docker images
build:
	docker compose build

# Lint code
lint:
	deno lint

# Format code
fmt:
	deno fmt

# Check formatting without modifying
check:
	deno fmt --check
	deno lint

# Publish to JSR (when ready)
publish:
	deno publish
