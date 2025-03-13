#!/bin/bash



# Using xclip as an example
# ./script.sh supabase/migrations | xclip -sel clipboard

for file in $1/*; do
  clipboard+="    $(basename $file): |\n"
  clipboard+=$(cat $file | awk '{print "      "$0}')
  clipboard+="\n"
done

echo -e "$clipboard"