#!/bin/bash
# Creates collector/.env with Supabase credentials
# Run from the repo root: bash setup-env.sh

ENV_FILE="$(dirname "$0")/collector/.env"

echo "MeshGuild — collector/.env setup"
echo ""

echo -n "Paste SUPABASE_SERVICE_KEY: "
read -r SERVICE_KEY

echo -n "Paste SUPABASE_ANON_KEY: "
read -r ANON_KEY

cat > "$ENV_FILE" <<EOF
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_TOPIC=msh/US/2/json/#
SUPABASE_URL=https://oxsesryubeolaclexlvv.supabase.co
SUPABASE_SERVICE_KEY=${SERVICE_KEY}
SUPABASE_ANON_KEY=${ANON_KEY}
NETWORK_ID=okc-crew
EOF

echo ""
echo "Written to $ENV_FILE"