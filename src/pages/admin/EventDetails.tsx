import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function EventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to event hub - this page is no longer used directly
    navigate(`/event/${id}`, { replace: true });
  }, [id, navigate]);

  return null;
}
