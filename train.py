from pathlib import Path

import joblib
from ucimlrepo import fetch_ucirepo
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

# En esta sesion  se realzair la prediccion de los datos de entrada, para ello se hace uso del dataset de la UCI, especificamente el dataset y ademas este train.py es donde se realzai el entrenamiento del modelo y ademas  se guarda el modelo entranado con sus resctivos pesos, Nota: EL modelo es de codigo abierto o  Open source , lo qu eindica que cualquier persona pueda utilizar para las pruebas, estudio o investiacion, pero el codigo y la arquitectura si es de codigo cerrado,  lo que indica que  persona que accedan al codigo fuente deben es estar autorizado por todo el equipo y por HML para pode rmejorar, El modelo es de tipo random forest,  y es solo la primer aversion, pero se espera que ene l futuro ya se epuda cambair de arquitectur ay pasar a deep learning  o convinar arquitecturas complejas.


def main():

    dataset = fetch_ucirepo(id=551)

    try:

        df = dataset.data.original
        if df is None:
            raise ValueError("Error: Dataset original data is None")

        entrada = [
            "AT", "AP", "AH", "AFDP", "GTEP",
            "TIT", "TAT", "TEY", "CDP"
        ]

        x = df[entrada]
        y = df['CO']

        if x.isna().any().any() or y.isna().any():
            raise ValueError("Error: Dataset contains NaN values")

        x_train, x_test, y_train, y_test = train_test_split(
            x, y, test_size=0.4, shuffle=False
        )

        referencia  = DummyRegressor(strategy="mean")
        referencia.fit(x_train, y_train)
        pred_referencia = referencia.predict(x_test)

        modelo = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)


        modelo.fit(x_train, y_train)
        predicciones = modelo.predict(x_test)


        print("R^2:", r2_score(y_test, predicciones))
        print("MAE:", mean_absolute_error(y_test, predicciones))


        carpeta = Path(__file__).parent
        joblib.dump({
            "modelo": modelo,
            "referencia": referencia,
            "entradas": list(x.columns),
            "objetivo": y.name
        }, 
        carpeta / "modelo_entrenado.pkl"
        )


        muestra = x_test.iloc[[0]]
        muestra.to_json(
            carpeta / "muestra.json",
            orient="records",
            indent=2
        )


        print("Modelo entrenado y guardado exitosamente en 'modelo_entrenado.pkl'.")
        print("CO real:", float(y_test.iloc[0]))
        print(muestra.to_dict(orient="records")[0])
        print("CO predicho:", float(predicciones[0]))
        print("CO referencia:", float(pred_referencia[0]))


    except Exception as e:
        print(f"Error during model training: {e}")

if __name__ == "__main__":
    main()
