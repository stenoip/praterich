curl --request POST \
     --url https://deep-image.ai/rest_api/process_result \
     --header 'content-type: application/json' \
     --header 'x-api-key: a6e669a0-cb91-11f0-a947-e79092c8e12c' \
     --data '{
         "url": "https://deep-image.ai/api-example3.jpg",
         "width": 1024,
         "height": 1024,
         "background": {
             "generate": {
                 "description": "Woman in a beige pantsuit, arms in pockets, looking professional, standing near a bookshelf. Outfit: beige linen pantsuit and white blouse.",
                 "adapter_type": "face",
                 "model_type": "realistic", 
                 "avatar_generation_type": "regular"
             }
         }
      }'
