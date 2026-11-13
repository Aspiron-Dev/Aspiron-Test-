#!/usr/bin/env bash
# Builds a throw-away test database: Supabase stand-ins + mock tables + the exported base functions + every
# supabase_v*.sql file in the order of README.md, then fake test data. Never point this at the real database.
# Uses the usual PostgreSQL variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
set -euo pipefail
cd "$(dirname "$0")/../.."
case "${PGHOST:-}" in *supabase*) echo "Refusing to run against Supabase."; exit 1 ;; esac
export PGOPTIONS='-c client_min_messages=warning'
P() { psql -v ON_ERROR_STOP=1 -q -X -f "$1" >/dev/null; }
# the order of README.md (re-runs included); add new files here when the README order changes
ORDER="v9_banners v10_push v11_pyq v12_test_alerts v13_store v17_store_fix v18_store_schedule v19_store_security
 v20_store_payer v21_devices v22_alerts_via_send_push v23_reviews v24_cheating v25_cheat_leaderboard v26_lift_fix
 v27_lift_fix2 v28_store_followup v29_payments v30_promotions v30_store_explore v31_store_soon v30_result_time
 v32_store_layout v33_live_one_attempt v34_attack_fixes v35_admin_team v36_notice_audience v35_admin_team
 v38_store_cleanup v39_scale v40_series_msg v35_admin_team v41_medium v35_admin_team
 v25_cheat_leaderboard v30_result_time v33_live_one_attempt v34_attack_fixes v39_scale v41_medium
 v42_audit_fixes v43_test_rules v44_edit_details v45_checklist_cd v46_order_trash v47_alerts_results v48_review_low v35_admin_team
 v49_answer_sheet v50_rank_order v51_test_pdf v35_admin_team v52_coupons_refer v53_refer_fixes v35_admin_team
 v54_store_map v55_qbank v35_admin_team v56_student_keep v57_social v35_admin_team
 v58_wallet_history v59_money_month v60_coupons_many v35_admin_team v61_tests_page v62_admin_guard v63_telegram_alerts v35_admin_team v64_series_page v35_admin_team v65_auth v66_tracker_keep v67_test_reviews v35_admin_team v68_reattempt_cheat_pdf v35_admin_team v69_test_chapters v70_ops v35_admin_team v71_refer_code v72_owner_profile v35_admin_team v73_contacts v74_login_code_once"
P tests/db/00_supabase_stubs.sql
P tests/db/01_mock_schema.sql
P tests/db/02_base_functions.sql
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
for f in $ORDER; do
  # pg_cron / pg_net do not exist in a plain PostgreSQL: their stand-ins are in 00_supabase_stubs.sql
  sed -E 's/^\s*create extension if not exists (pg_cron|pg_net)[^;]*;//I' "supabase_$f.sql" > "$tmp"
  P "$tmp" || { echo "FAILED while running supabase_$f.sql"; exit 1; }
done
P tests/db/seed.sql
echo "test database ready"
