.PHONY: build check preview
build:
	npm run build
check:
	npm run check
	npm run test:e2e
preview:
	npm run preview
