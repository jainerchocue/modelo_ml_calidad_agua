from ucimlrepo import fetch_ucirepo
from flask import Flask, jsonify


# En esta sesion  se realzair la prediccion de los datos de entrada, para ello se hace uso del dataset de la UCI, especificamente el dataset y ademas este app.py se encarga de comunicar o exponer la prediccion de los datos de entrada a traves de un endpoint, el cual se puede consumir desde cualquier cliente que pueda hacer peticiones HTTP, como Postman o un navegador web.


app = Flask(__name__)

@app.route('/predict', methods=['POST'])
def predict():
    # fetch dataset 
    dataset = fetch_ucirepo(id=551)

    df = dataset.data.original

    if df is None:
        return jsonify({"error": "Dataset is None"}), 500
    
    x = df.drop(columns=['CO','NOX', 'year'])
    y = df['CO']

   
    return jsonify({
        "message": "Dataset fetched successfully",
        "entradas": list(x.columns),
        "objetivo": y.name,
        "x_shape": list(x.shape),
        "y_shape": list(y.shape)
        }), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0' , port=5000)