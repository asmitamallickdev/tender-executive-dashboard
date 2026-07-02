import { DatabaseTenderService } from "../services/databaseTenderService.js";

export class TenderController {
  /**
   * Endpoint: PATCH /api/tenders/:id
   * Updates only tenderUpdateStatus and nextAction.
   */
  static async updateTender(req, res) {
    const { id } = req.params;
    const { tenderUpdateStatus, nextAction } = req.body;

    if (!tenderUpdateStatus) {
      return res.status(400).json({ error: "tenderUpdateStatus is required" });
    }

    const validStatuses = ["OPEN", "CLOSED"];
    if (!validStatuses.includes(tenderUpdateStatus)) {
      return res.status(400).json({ error: "Invalid tenderUpdateStatus value" });
    }

    const validActions = [
      "UPDATE_FROM_AB_LETTER",
      "BG_REFUND_LETTER_TO_BE_SENT",
      "FOLLOW_UP_FOR_FINANCIAL_STATUS",
      "REVERSE_AUCTION_PENDING",
      null
    ];
    if (nextAction !== undefined && !validActions.includes(nextAction)) {
      return res.status(400).json({ error: "Invalid nextAction value" });
    }

    try {
      const updated = await DatabaseTenderService.updateTenderStatusAndAction(
        id,
        tenderUpdateStatus,
        nextAction
      );
      return res.status(200).json(updated);
    } catch (err) {
      console.error(`[API_ERROR] Failed to update tender ${id}: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }
}

export function registerTenderRoutes(router) {
  router.patch("/api/tenders/:id", TenderController.updateTender);
}
