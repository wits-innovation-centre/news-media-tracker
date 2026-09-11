#!/bin/sh

corepack enable
corepack prepare pnpm@12.3.4 --activate

pnpm install
