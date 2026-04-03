---
name: build-service
description: Step-by-step workflow for building a new platform service in packages/
---

# Build Service Skill

When asked to build a new service package, follow this workflow:

## Step 1: Read the Spec
- Read /CLAUDE.md and find the service specification
- Identify the interface from packages/shared/ that this service implements

## Step 2: Create Package Structure
- packages/[name]/package.json with name, version, dependencies
- packages/[name]/tsconfig.json extending root tsconfig
- packages/[name]/src/index.ts as the main entry point
- packages/[name]/src/[name]-service.ts with the implementation
- packages/[name]/src/types.ts for service-specific types (import shared types from packages/shared/)

## Step 3: Implement
- Import the interface from packages/shared/
- Implement every method defined in the interface
- Use Prisma for all database operations (import from packages/database/)
- Use zod for input validation
- Throw typed AppError for all error cases
- Add JSDoc comments to every public function

## Step 4: Test
- Create packages/[name]/src/[name]-service.test.ts
- Test every public method: happy path, error cases, edge cases
- For wallet/money: test concurrent access and race conditions
- Run: npx vitest packages/[name]/

## Step 5: Export
- Export all public functions and types from packages/[name]/src/index.ts
- Verify other packages can import from this package
