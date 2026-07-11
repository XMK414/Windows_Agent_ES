// Guided break routines — the "further help" behind each break option. Each
// routine is a sequence of timed, spoken cues so a break is actually walked
// through rather than just named. Durations are in seconds per step.

export interface RoutineStep {
  text: string;
  seconds: number;
}

export interface Routine {
  label: string;
  category: BreakCategory;
  summary: string;
  steps: RoutineStep[];
}

export type BreakCategory = "breathing" | "neck" | "full-body-scan" | "meditation";

export const CATEGORY_LABELS: Record<BreakCategory, string> = {
  breathing: "Breathing",
  neck: "Neck Exercise",
  "full-body-scan": "Full Body Scan",
  meditation: "Meditation",
};

/** Build a repeated breathing pattern into individual timed cues. */
function breathingCycles(
  pattern: { text: string; seconds: number }[],
  rounds: number,
): RoutineStep[] {
  const steps: RoutineStep[] = [];
  for (let r = 0; r < rounds; r++) {
    for (const p of pattern) steps.push({ ...p });
  }
  return steps;
}

const INTRO = (text: string): RoutineStep => ({ text, seconds: 4 });
const OUTRO: RoutineStep = { text: "Nicely done. Ease back to what you were doing.", seconds: 4 };

export const ROUTINES: Record<BreakCategory, Routine[]> = {
  breathing: [
    {
      label: "Box Breath",
      category: "breathing",
      summary: "Equal 4-count in, hold, out, hold — steadies focus.",
      steps: [
        INTRO("Box breathing. Sit tall, relax your shoulders."),
        ...breathingCycles(
          [
            { text: "Breathe in through your nose.", seconds: 4 },
            { text: "Hold.", seconds: 4 },
            { text: "Breathe out slowly.", seconds: 4 },
            { text: "Hold.", seconds: 4 },
          ],
          4,
        ),
        OUTRO,
      ],
    },
    {
      label: "Calm Down",
      category: "breathing",
      summary: "Longer exhale than inhale to down-shift a stress response.",
      steps: [
        INTRO("Let's calm the nervous system with a long exhale."),
        ...breathingCycles(
          [
            { text: "Breathe in for four.", seconds: 4 },
            { text: "Breathe out for six.", seconds: 6 },
          ],
          5,
        ),
        OUTRO,
      ],
    },
    {
      label: "Reset",
      category: "breathing",
      summary: "Physiological sigh — a double inhale and a long release.",
      steps: [
        INTRO("The physiological sigh — great for a quick reset."),
        ...breathingCycles(
          [
            { text: "Inhale through the nose.", seconds: 3 },
            { text: "A second short sip of air in.", seconds: 2 },
            { text: "Long exhale through the mouth.", seconds: 6 },
          ],
          4,
        ),
        OUTRO,
      ],
    },
    {
      label: "Ease Off",
      category: "breathing",
      summary: "4-7-8 breathing to release tension.",
      steps: [
        INTRO("4-7-8 breathing. Tongue behind your top teeth."),
        ...breathingCycles(
          [
            { text: "Inhale for four.", seconds: 4 },
            { text: "Hold for seven.", seconds: 7 },
            { text: "Exhale for eight.", seconds: 8 },
          ],
          4,
        ),
        OUTRO,
      ],
    },
  ],
  neck: [
    {
      label: "Release",
      category: "neck",
      summary: "Chin tucks and slow half-circles to release the neck.",
      steps: [
        INTRO("Sit tall. We'll gently release the neck."),
        { text: "Tuck your chin toward your chest, feel the back of the neck lengthen.", seconds: 12 },
        { text: "Slowly lift back to center.", seconds: 6 },
        { text: "Roll your right ear toward your right shoulder in a slow half-circle.", seconds: 12 },
        { text: "Back through center, and over to the left.", seconds: 12 },
        { text: "Return to center and relax.", seconds: 6 },
        OUTRO,
      ],
    },
    {
      label: "Soothe",
      category: "neck",
      summary: "Ear-to-shoulder holds to soothe the side of the neck.",
      steps: [
        INTRO("We'll hold a gentle side stretch each way."),
        { text: "Drop your right ear toward your right shoulder. Let the weight of your head do the work.", seconds: 20 },
        { text: "Slowly return to center.", seconds: 5 },
        { text: "Now the left ear toward the left shoulder. Breathe into the stretch.", seconds: 20 },
        { text: "Return to center.", seconds: 5 },
        OUTRO,
      ],
    },
    {
      label: "Stretch Out",
      category: "neck",
      summary: "Targeted upper-trap and levator stretches with holds.",
      steps: [
        INTRO("A deeper stretch for tight upper traps."),
        { text: "Right hand gently over your head to the left side. Ease your head left and hold.", seconds: 20 },
        { text: "Release slowly to center.", seconds: 5 },
        { text: "Turn your chin toward your right armpit and look down — stretch the back-left of the neck.", seconds: 18 },
        { text: "Back to center. Now mirror it on the other side.", seconds: 20 },
        { text: "Return to center and roll the shoulders back twice.", seconds: 8 },
        OUTRO,
      ],
    },
  ],
  "full-body-scan": [
    {
      label: "Quick Scan",
      category: "full-body-scan",
      summary: "A 6-minute head-to-toe check-in.",
      steps: [
        INTRO("Close your eyes if you can. We'll scan the body quickly."),
        { text: "Notice your face and jaw. Let them soften.", seconds: 45 },
        { text: "Move to your shoulders and arms. Let them drop and heavy.", seconds: 60 },
        { text: "Your chest and belly — feel them rise and fall.", seconds: 60 },
        { text: "Your hips and legs — release any holding.", seconds: 60 },
        { text: "Down to your feet. Feel them grounded.", seconds: 45 },
        { text: "Sense the whole body at once, at ease.", seconds: 30 },
        OUTRO,
      ],
    },
    {
      label: "Top to Bottom",
      category: "full-body-scan",
      summary: "A 10-minute slower, more detailed scan.",
      steps: [
        INTRO("Settle in. A slower scan from the crown down."),
        { text: "Crown of the head and scalp — soften.", seconds: 70 },
        { text: "Eyes, jaw, and tongue — let them go loose.", seconds: 70 },
        { text: "Neck and shoulders — melt them down.", seconds: 80 },
        { text: "Arms to fingertips — heavy and warm.", seconds: 80 },
        { text: "Chest, back, and belly — breathing on its own.", seconds: 80 },
        { text: "Hips, legs, and feet — fully supported.", seconds: 80 },
        { text: "Whole body, one calm field of sensation.", seconds: 40 },
        OUTRO,
      ],
    },
    {
      label: "Deep Focus",
      category: "full-body-scan",
      summary: "An 11-minute scan that anchors attention as it moves.",
      steps: [
        INTRO("We'll hold attention gently on each area."),
        { text: "Rest attention on the breath for a few rounds.", seconds: 60 },
        { text: "Face and head — notice, don't judge.", seconds: 90 },
        { text: "Shoulders and arms — soften on each exhale.", seconds: 90 },
        { text: "Torso — feel the breath move it.", seconds: 90 },
        { text: "Pelvis and legs — release downward.", seconds: 90 },
        { text: "Feet and toes — fully let go.", seconds: 90 },
        { text: "Rest in the whole body, alert and easy.", seconds: 50 },
        OUTRO,
      ],
    },
    {
      label: "Full Scan",
      category: "full-body-scan",
      summary: "A 14-minute complete relaxation scan.",
      steps: [
        INTRO("The full scan. No rush — let each part fully release."),
        { text: "Begin with three slow breaths.", seconds: 60 },
        { text: "Head and face.", seconds: 110 },
        { text: "Neck and shoulders.", seconds: 110 },
        { text: "Arms and hands.", seconds: 110 },
        { text: "Chest and upper back.", seconds: 110 },
        { text: "Belly and lower back.", seconds: 110 },
        { text: "Hips, legs, and feet.", seconds: 110 },
        { text: "Rest in stillness for the whole body.", seconds: 60 },
        OUTRO,
      ],
    },
  ],
  meditation: [
    {
      label: "Short Pause",
      category: "meditation",
      summary: "A 4-minute breath-focused pause.",
      steps: [
        INTRO("A short pause. Let the eyes soften or close."),
        { text: "Follow the breath in and out. When the mind wanders, gently return.", seconds: 90 },
        { text: "Count each exhale, one to ten, then start again.", seconds: 90 },
        { text: "Let go of counting. Just be here, breathing.", seconds: 45 },
        OUTRO,
      ],
    },
    {
      label: "Long Session",
      category: "meditation",
      summary: "A 13-minute breath, body, and open-awareness sit.",
      steps: [
        INTRO("A longer sit. Find a stable, comfortable posture."),
        { text: "Arrive. Feel the points of contact with the seat.", seconds: 90 },
        { text: "Follow the natural breath, no need to change it.", seconds: 180 },
        { text: "Widen to the whole body breathing.", seconds: 180 },
        { text: "Open to sounds around you, coming and going.", seconds: 150 },
        { text: "Rest in open awareness — nothing to do.", seconds: 120 },
        { text: "Gently return, wiggle fingers and toes.", seconds: 40 },
        OUTRO,
      ],
    },
  ],
};

export function routineDurationMin(routine: Routine): number {
  const total = routine.steps.reduce((s, step) => s + step.seconds, 0);
  return Math.max(1, Math.round(total / 60));
}
