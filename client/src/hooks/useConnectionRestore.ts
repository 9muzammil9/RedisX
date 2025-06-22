import { useEffect } from "react";
import { useStore } from "../store/useStore";
import toast from "react-hot-toast";

export const useConnectionRestore = () => {
  const { connections, activeConnectionId } = useStore();

  useEffect(() => {
    // Show a message if there are saved connections
    if (connections.length > 0) {
      toast.success(
        `${connections.length} saved connection(s) loaded. Click to reconnect.`,
        { duration: 4000 }
      );
    }

    // Clear any stale active connection if it doesn't exist in saved connections
    if (
      activeConnectionId &&
      !connections.find((conn) => conn.id === activeConnectionId)
    ) {
      useStore.getState().setActiveConnection(null);
    }
  }, []); // Empty dependency array means this runs only once on mount
};
