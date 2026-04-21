export type CortiAssistantStatus = {
  tone: "default" | "error";
  message: string;
};

export type CortiAssistantInteractionData = {
  assignedUserId: string | null;
  encounter: {
    identifier: string;
    status: "planned";
    type: "first_consultation";
    period: {
      startedAt: string;
    };
  };
};
