import { generateBunwireArtifacts } from "@bunwire/vite";

await generateBunwireArtifacts({ root: import.meta.dirname });
await generateBunwireArtifacts({ root: `${import.meta.dirname}/worker` });
await generateBunwireArtifacts({ root: `${import.meta.dirname}/scheduler` });
await generateBunwireArtifacts({ root: `${import.meta.dirname}/command` });
