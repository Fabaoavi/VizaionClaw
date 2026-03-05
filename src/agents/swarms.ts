// ─── Gravity Claw — Agent Swarms ────────────────────────────────
// Spawn specialized sub-agents that collaborate on complex tasks.

import { callLLM } from "../llm.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";

export interface SubAgent {
    role: string;
    systemPrompt: string;
}

const AGENTS: Record<string, SubAgent> = {
    researcher: {
        role: "Researcher",
        systemPrompt: "You are a research specialist. Your job is to find, verify, and summarize information. Be thorough and cite sources when possible.",
    },
    coder: {
        role: "Coder",
        systemPrompt: "You are a coding specialist. Write clean, well-documented code. Follow best practices. Explain your technical decisions.",
    },
    reviewer: {
        role: "Reviewer",
        systemPrompt: "You are a code/content reviewer. Find bugs, suggest improvements, and ensure quality. Be constructive and specific.",
    },
    planner: {
        role: "Planner",
        systemPrompt: "You are a project planner. Break down complex tasks into steps. Prioritize, estimate effort, and identify dependencies.",
    },
    writer: {
        role: "Writer",
        systemPrompt: "You are a writing specialist. Craft clear, engaging, and well-structured content. Match the requested tone and style.",
    },
};

export interface SwarmResult {
    agents: Array<{ role: string; response: string }>;
    synthesis: string;
}

/**
 * Run a task through multiple specialized agents and synthesize their outputs.
 */
export async function runSwarm(
    task: string,
    agentRoles: string[] = ["researcher", "coder", "reviewer"],
    synthesize = true
): Promise<SwarmResult> {
    const results: Array<{ role: string; response: string }> = [];

    console.log(`🐝 Swarm: starting with ${agentRoles.length} agents`);

    for (const role of agentRoles) {
        const agent = AGENTS[role];
        if (!agent) {
            results.push({ role, response: `Unknown agent role: ${role}` });
            continue;
        }

        console.log(`   🤖 ${agent.role} working...`);

        const messages: ChatCompletionMessageParam[] = [
            { role: "user", content: task },
        ];

        // Include previous agents' outputs as context
        if (results.length > 0) {
            const context = results.map((r) => `[${r.role}]: ${r.response}`).join("\n\n");
            messages[0] = {
                role: "user",
                content: `Task: ${task}\n\nPrevious agents' work:\n${context}\n\nNow contribute your perspective as ${agent.role}.`,
            };
        }

        const response = await callLLM(messages, undefined, agent.systemPrompt);
        results.push({ role: agent.role, response: response.content ?? "(no output)" });
    }

    let synthesis = "";
    if (synthesize && results.length > 1) {
        console.log("   🧬 Synthesizing...");
        const synthMessages: ChatCompletionMessageParam[] = [{
            role: "user",
            content: `Multiple specialists worked on this task: "${task}"\n\nTheir outputs:\n${results.map((r) => `**${r.role}:**\n${r.response}`).join("\n\n")}\n\nSynthesize their outputs into a single, coherent response.`,
        }];
        const synthResponse = await callLLM(synthMessages, undefined, "You synthesize multiple expert opinions into clear, actionable summaries.");
        synthesis = synthResponse.content ?? "";
    } else if (results.length === 1) {
        synthesis = results[0]!.response;
    }

    return { agents: results, synthesis };
}

/**
 * Decompose a goal into subtasks and run them sequentially.
 */
export async function runMesh(goal: string): Promise<string> {
    console.log(`🕸️ Mesh: decomposing goal: "${goal.slice(0, 80)}..."`);

    // Phase 1: Plan
    const planResponse = await callLLM(
        [{ role: "user", content: `Decompose this goal into 3-5 concrete subtasks:\n"${goal}"\n\nReturn a numbered list.` }],
        undefined,
        "You are a task planner. Break complex goals into clear, sequential steps."
    );

    const plan = planResponse.content ?? "";
    console.log(`   📋 Plan:\n${plan}`);

    // Phase 2: Execute each step
    const steps = plan.split("\n").filter((l) => /^\d+\./.test(l.trim()));
    const stepResults: string[] = [];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!.replace(/^\d+\.\s*/, "").trim();
        console.log(`   ⚙️ Step ${i + 1}: ${step}`);

        const stepResponse = await callLLM(
            [{ role: "user", content: `Execute this step: "${step}"\n\nContext (previous steps):\n${stepResults.join("\n")}\n\nProvide a clear, concise result.` }],
        );
        stepResults.push(`Step ${i + 1} (${step}): ${stepResponse.content}`);
    }

    // Phase 3: Summarize
    const summaryResponse = await callLLM(
        [{ role: "user", content: `Summarize the results of this workflow:\nGoal: "${goal}"\n\nResults:\n${stepResults.join("\n\n")}\n\nProvide a final summary.` }],
    );

    return summaryResponse.content ?? "Mesh workflow completed.";
}
