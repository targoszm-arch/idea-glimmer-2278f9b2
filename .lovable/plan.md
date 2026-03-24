## Replace all `contentlab.skillstudio.ai` URLs with `content-lab.ie`

### Summary

8 files contain the old domain `contentlab.skillstudio.ai`. All instances will be replaced with `content-lab.ie`, keeping the same paths.

### Files and changes  
  
YOU MISSED:  
  
[https://content-lab.ie/payment-success](https://content-lab.ie/payment-success)   (new)  
  
Previously [https://contentlab.skillstudio.ai/payment-success](https://contentlab.skillstudio.ai/payment-success) (old)  
  



| File                                                  | Old URL                                                                                        | New URL                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `framer-plugin/src/App.tsx`                           | `https://contentlab.skillstudio.ai/signup`                                                     | `https://content-lab.ie/signup`                         |
| `supabase/functions/google-oauth-start/index.ts`      | `.../integrations/google/callback`                                                             | `https://content-lab.ie/integrations/google/callback`   |
| `supabase/functions/google-oauth-callback/index.ts`   | `.../settings/integrations` (frontendBase) + `.../integrations/google/callback` (REDIRECT_URI) | `https://content-lab.ie/...`                            |
| `supabase/functions/shopify-oauth-start/index.ts`     | `.../integrations/shopify/callback`                                                            | `https://content-lab.ie/integrations/shopify/callback`  |
| `supabase/functions/shopify-oauth-callback/index.ts`  | `.../settings/integrations`                                                                    | `https://content-lab.ie/settings/integrations`          |
| `supabase/functions/intercom-oauth-start/index.ts`    | `.../integrations/intercom/callback`                                                           | `https://content-lab.ie/integrations/intercom/callback` |
| `supabase/functions/intercom-oauth-callback/index.ts` | `.../settings/integrations`                                                                    | `https://content-lab.ie/settings/integrations`          |
| `supabase/functions/notion-oauth-callback/index.ts`   | `.../settings/integrations`                                                                    | `https://content-lab.ie/settings/integrations`          |


All 8 files, simple find-and-replace of `contentlab.skillstudio.ai` → `content-lab.ie`. Edge functions will need redeployment after the change.