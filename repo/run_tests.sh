#!/bin/bash
###############################################################################
# run_tests.sh - Global Test Execution Script
# Hospitality Operations Management System
#
# Runs all backend and frontend test suites within Docker containers.
# Outputs a clear summary: Total tests, Passes, Failures, and error logs.
###############################################################################

set +e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.test.yml"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Hospitality Operations Management System - Test Suite     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

BACKEND_PASS=0
BACKEND_FAIL=0
FRONTEND_PASS=0
FRONTEND_FAIL=0
E2E_PASS=0
E2E_FAIL=0
TOTAL_PASS=0
TOTAL_FAIL=0
ERRORS=""

###############################################################################
# Build test images
###############################################################################
echo -e "${BLUE}━━━ Building test images ━━━${NC}"
docker compose $COMPOSE_FILES build backend-test frontend-test
echo ""

###############################################################################
# Backend Tests (inside Docker)
###############################################################################
echo -e "${BLUE}━━━ Backend Tests (Docker) ━━━${NC}"
BACKEND_OUTPUT=$(docker compose $COMPOSE_FILES run --rm backend-test 2>&1)
BACKEND_EXIT=$?
echo "$BACKEND_OUTPUT"

if [ $BACKEND_EXIT -eq 0 ]; then
  BACKEND_RESULT="PASS"
else
  BACKEND_RESULT="FAIL"
fi

# Parse results from vitest output
BACKEND_PASS=$(echo "$BACKEND_OUTPUT" | grep -oP 'Tests\s+\K\d+(?=\s+passed)' 2>/dev/null | tail -1 || echo "0")
BACKEND_FAIL=$(echo "$BACKEND_OUTPUT" | grep -oP '\K\d+(?=\s+failed)' 2>/dev/null | tail -1 || echo "0")
if [ -z "$BACKEND_PASS" ]; then BACKEND_PASS=0; fi
if [ -z "$BACKEND_FAIL" ]; then BACKEND_FAIL=0; fi

if [ "$BACKEND_RESULT" = "FAIL" ]; then
  ERRORS="${ERRORS}\n--- Backend Test Errors ---\n$(echo "$BACKEND_OUTPUT" | tail -30)"
fi
echo ""

###############################################################################
# Frontend Tests (inside Docker)
###############################################################################
echo -e "${BLUE}━━━ Frontend Tests (Docker) ━━━${NC}"
FRONTEND_OUTPUT=$(docker compose $COMPOSE_FILES run --rm frontend-test 2>&1)
FRONTEND_EXIT=$?
echo "$FRONTEND_OUTPUT"

if [ $FRONTEND_EXIT -eq 0 ]; then
  FRONTEND_RESULT="PASS"
else
  FRONTEND_RESULT="FAIL"
fi

# Parse results from vitest output
FRONTEND_PASS=$(echo "$FRONTEND_OUTPUT" | grep -oP 'Tests\s+\K\d+(?=\s+passed)' 2>/dev/null | tail -1 || echo "0")
FRONTEND_FAIL=$(echo "$FRONTEND_OUTPUT" | grep -oP '\K\d+(?=\s+failed)' 2>/dev/null | tail -1 || echo "0")
if [ -z "$FRONTEND_PASS" ]; then FRONTEND_PASS=0; fi
if [ -z "$FRONTEND_FAIL" ]; then FRONTEND_FAIL=0; fi

if [ "$FRONTEND_RESULT" = "FAIL" ]; then
  ERRORS="${ERRORS}\n--- Frontend Test Errors ---\n$(echo "$FRONTEND_OUTPUT" | tail -30)"
fi
echo ""

###############################################################################
# E2E Tests (inside Docker with Playwright)
###############################################################################
echo -e "${BLUE}━━━ E2E Tests (Docker/Playwright) ━━━${NC}"

# Start backend + frontend for E2E
docker compose $COMPOSE_FILES up -d backend frontend

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

E2E_OUTPUT=$(docker compose $COMPOSE_FILES run --rm e2e-test 2>&1)
E2E_EXIT=$?
echo "$E2E_OUTPUT"

# Stop the services
docker compose $COMPOSE_FILES stop backend frontend

E2E_PASS=$(echo "$E2E_OUTPUT" | grep -oP '\K\d+(?=\s+passed)' 2>/dev/null | tail -1 || echo "0")
E2E_FAIL=$(echo "$E2E_OUTPUT" | grep -oP '\K\d+(?=\s+failed)' 2>/dev/null | tail -1 || echo "0")
if [ -z "$E2E_PASS" ]; then E2E_PASS=0; fi
if [ -z "$E2E_FAIL" ]; then E2E_FAIL=0; fi

if [ $E2E_EXIT -ne 0 ]; then
  ERRORS="${ERRORS}\n--- E2E Test Errors ---\n$(echo "$E2E_OUTPUT" | tail -30)"
fi
echo ""

###############################################################################
# Cleanup containers and networks
###############################################################################
echo -e "${BLUE}━━━ Cleaning up ━━━${NC}"
docker compose $COMPOSE_FILES down --remove-orphans
echo ""

###############################################################################
# Summary
###############################################################################
TOTAL_PASS=$((BACKEND_PASS + FRONTEND_PASS + E2E_PASS))
TOTAL_FAIL=$((BACKEND_FAIL + FRONTEND_FAIL + E2E_FAIL))
TOTAL=$((TOTAL_PASS + TOTAL_FAIL))

echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                    TEST SUMMARY                             ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
printf "${BOLD}║${NC}  %-30s  ${GREEN}%4s passed${NC}  ${RED}%4s failed${NC}  ${BOLD}║${NC}\n" "Backend Tests" "$BACKEND_PASS" "$BACKEND_FAIL"
printf "${BOLD}║${NC}  %-30s  ${GREEN}%4s passed${NC}  ${RED}%4s failed${NC}  ${BOLD}║${NC}\n" "Frontend Tests" "$FRONTEND_PASS" "$FRONTEND_FAIL"
printf "${BOLD}║${NC}  %-30s  ${GREEN}%4s passed${NC}  ${RED}%4s failed${NC}  ${BOLD}║${NC}\n" "E2E Tests" "$E2E_PASS" "$E2E_FAIL"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
printf "${BOLD}║${NC}  %-30s  ${GREEN}%4s passed${NC}  ${RED}%4s failed${NC}  ${BOLD}║${NC}\n" "TOTAL" "$TOTAL_PASS" "$TOTAL_FAIL"
echo -e "${BOLD}║${NC}  Total Tests: ${BOLD}${TOTAL}${NC}                                            ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"

if [ "$TOTAL_FAIL" -gt 0 ] || [ $BACKEND_EXIT -ne 0 ] || [ $FRONTEND_EXIT -ne 0 ] || [ $E2E_EXIT -ne 0 ]; then
  echo ""
  echo -e "${RED}━━━ Error Logs ━━━${NC}"
  echo -e "$ERRORS"
  echo ""
  echo -e "${RED}${BOLD}TESTS FAILED${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}${BOLD}ALL TESTS PASSED${NC}"
  exit 0
fi
