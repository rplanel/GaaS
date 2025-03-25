#!/bin/bash

# Using xclip as an example
# ./script.sh supabase/migrations | xclip -sel clipboard

for file in $1/*; do
  if [ -f "$file" ]; then
    clipboard+="    $(basename $file): |\n"
    clipboard+=$(cat $file | awk '{print "      "$0}')
    clipboard+="\n"
  fi
done

echo -e "$clipboard"
