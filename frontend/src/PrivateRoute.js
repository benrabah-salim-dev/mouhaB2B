import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';

const PrivateRoute = () => {
  const { user } = useContext(AuthContext);

  if (user === null) return null; // ou loader, on attend la confirmation de l’auth

  return user ? <Outlet /> : <Navigate to="/login" />;
};

export default PrivateRoute;
