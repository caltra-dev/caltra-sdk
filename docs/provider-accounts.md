# Provider account inventory

`docs/provider-accounts.yaml.gitvaulty` records provider login identities, usage, sharing, and resources for this repository. It has one `accounts` list and no schema version. Sharing refers to other products or repositories, not local and production environments of the same product. Unknown usernames and sharing are explicitly null with notes.

The inventory is operator documentation encrypted for privacy. It contains no credentials and is not application configuration or a runtime synchronization input. Provider coordinates recorded from repository configuration are source evidence; `last_verified` remains null until a provider check confirms the recorded facts.

Use the existing operator-only GitVaulty team access. Pass the native temporary file directly to a local consumer without logging its contents:

```sh
npx --no-install gitvaulty run -f docs/provider-accounts.yaml -- <local-consumer> docs/provider-accounts.yaml
```

Keep the native plaintext ignored and remove it after editing. Update account and resource usage when it changes; preserve evidence, and never infer ownership from a repository namespace or login alone. Validate YAML, encryption round-trip, unchanged operator access, no credentials, and plaintext cleanup before committing an inventory-only edit.
